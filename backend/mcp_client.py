import os
import time
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable

import requests

from utils import get_config_value

logger = logging.getLogger(__name__)

MCPRequestObserver = Callable[[dict[str, Any]], None]
_mcp_request_observer: MCPRequestObserver | None = None

_PROFILE_ALIASES = {
    "dev": "dev",
    "development": "dev",
    "main": "main",
    "master": "main",
    "prod": "main",
    "production": "main",
}


def _normalize_profile(value: str | None) -> str | None:
    if not value:
        return None
    return _PROFILE_ALIASES.get(value.strip().lower())


def _detect_git_branch(repo_root: Path) -> str | None:
    head_path = repo_root / ".git" / "HEAD"
    try:
        head_contents = head_path.read_text(encoding="utf-8").strip()
    except OSError:
        return None

    if not head_contents.startswith("ref: "):
        return None

    ref_path = head_contents.replace("ref: ", "", 1).strip()
    if ref_path.startswith("refs/heads/"):
        return ref_path.replace("refs/heads/", "", 1)
    return None


def _detect_profile() -> str:
    explicit = (
        os.getenv("MCP_PROFILE")
        or os.getenv("TONPIXO_ENV")
        or os.getenv("APP_ENV")
        or os.getenv("DEPLOYMENT_PROFILE")
    )
    profile = _normalize_profile(explicit)
    if profile:
        return profile

    repo_root = Path(__file__).resolve().parent.parent
    branch_name = _detect_git_branch(repo_root)
    profile = _normalize_profile(branch_name)
    return profile or "dev"


def _read_env_key(env_path: Path, key: str) -> str | None:
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue

        candidate_key, candidate_value = line.split("=", 1)
        if candidate_key.strip() != key:
            continue

        value = candidate_value.strip().strip('"').strip("'")
        return value or None

    return None


def _normalize_base_url(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    if not text.startswith(("http://", "https://")):
        text = f"https://{text}"
    return text.rstrip("/")


def _resolve_mcp_repo_dir() -> Path:
    explicit = os.getenv("TONPIXO_MCP_DIR") or os.getenv("MCP_PROJECT_DIR")
    if explicit:
        expanded = Path(explicit).expanduser()
        if expanded.is_absolute():
            return expanded
        return (Path(__file__).resolve().parent / expanded).resolve()

    return Path(__file__).resolve().parents[2] / "tonpixo-mcp"


def _discover_local_mcp_settings() -> dict[str, str]:
    if os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        return {}

    mcp_dir = _resolve_mcp_repo_dir()
    if not mcp_dir.exists():
        return {}

    profile = _detect_profile()
    runtime_dir = mcp_dir / "runtime"
    profile_env = runtime_dir / f"{profile}.env"
    caddy_env = runtime_dir / "caddy.env"

    discovered: dict[str, str] = {
        "profile": profile,
        "repo_dir": str(mcp_dir),
    }

    token = _read_env_key(profile_env, "MCP_BEARER_TOKEN")
    if token:
        discovered["bearer_token"] = token

    domain_key = "MCP_DEV_DOMAIN" if profile == "dev" else "MCP_MAIN_DOMAIN"
    domain = _read_env_key(caddy_env, domain_key)
    if domain:
        discovered["base_url"] = _normalize_base_url(domain)
        discovered["base_url_source"] = f"{caddy_env.name}:{domain_key}"
        return discovered

    if profile_env.exists():
        port = "8082" if profile == "dev" else "8081"
        discovered["base_url"] = f"http://127.0.0.1:{port}"
        discovered["base_url_source"] = profile_env.name
    else:
        # Fallback for local single-process uvicorn run in tonpixo-mcp.
        port = os.getenv("TONPIXO_MCP_LOCAL_PORT", "8080").strip() or "8080"
        discovered["base_url"] = f"http://127.0.0.1:{port}"
        discovered["base_url_source"] = "default_local_port"

    return discovered


class MCPClientError(RuntimeError):
    """Raised when MCP service interaction fails."""


class MCPClient:
    def __init__(
        self,
        base_url: str,
        bearer_token: str,
        timeout_ms: int = 20000,
        retry_max: int = 2,
        cache_ttl_seconds: int = 900,
        request_observer: MCPRequestObserver | None = None,
    ):
        self.base_url = (base_url or "").rstrip("/")
        self.bearer_token = bearer_token or ""
        self.timeout_seconds = max(1, timeout_ms // 1000) if timeout_ms else 20
        self.retry_max = max(0, retry_max)
        self.cache_ttl_seconds = max(0, cache_ttl_seconds)
        self._prompt_cache: str | None = None
        self._prompt_cache_ts = 0.0
        self._tools_cache: list[str] | None = None
        self._tools_cache_ts = 0.0
        self._resources_cache: list[str] | None = None
        self._resources_cache_ts = 0.0
        self._resource_content_cache: dict[str, tuple[str, float]] = {}
        self.request_observer = request_observer
        # Debug-only storage for latest upstream error details (never raised to callers).
        self._last_upstream_error_detail: str | None = None

    def _observe(self, payload: dict[str, Any]) -> None:
        if not self.request_observer:
            return
        try:
            self.request_observer(payload)
        except Exception as exc:
            logger.debug("MCP request observer failed: %s", exc)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"
        return headers

    def _build_url(self, path: str) -> str:
        if self.base_url.endswith("/v1") and path.startswith("/v1/"):
            return f"{self.base_url}{path[3:]}"
        return f"{self.base_url}{path}"

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        if not self.base_url:
            raise MCPClientError("MCP_BASE_URL is not configured.")

        url = self._build_url(path)
        payload_keys = sorted(payload.keys()) if isinstance(payload, dict) else []
        last_error: Exception | None = None

        for attempt in range(self.retry_max + 1):
            try:
                started_at = time.time()
                response = requests.request(
                    method=method,
                    url=url,
                    headers=self._headers(),
                    json=payload,
                    timeout=self.timeout_seconds,
                )
                duration_ms = int((time.time() - started_at) * 1000)
                self._observe(
                    {
                        "event": "http",
                        "method": method.upper(),
                        "path": path,
                        "status_code": response.status_code,
                        "ok": bool(response.ok),
                        "attempt": attempt + 1,
                        "max_attempts": self.retry_max + 1,
                        "duration_ms": duration_ms,
                        "payload_keys": payload_keys,
                    }
                )

                if response.status_code >= 500 and attempt < self.retry_max:
                    self._last_upstream_error_detail = (
                        f"path={path} status={response.status_code} body={response.text[:2000]}"
                    )
                    logger.warning(
                        "MCP transient upstream error status=%s path=%s attempt=%s/%s; retrying",
                        response.status_code,
                        path,
                        attempt + 1,
                        self.retry_max + 1,
                    )
                    logger.debug(
                        "MCP upstream transient response body path=%s status=%s body=%s",
                        path,
                        response.status_code,
                        response.text[:2000],
                    )
                    time.sleep(0.25 * (attempt + 1))
                    continue

                if not response.ok:
                    self._last_upstream_error_detail = (
                        f"path={path} status={response.status_code} body={response.text[:2000]}"
                    )
                    logger.warning(
                        "MCP request failed status=%s path=%s attempt=%s/%s",
                        response.status_code,
                        path,
                        attempt + 1,
                        self.retry_max + 1,
                    )
                    logger.debug(
                        "MCP upstream error body path=%s status=%s body=%s",
                        path,
                        response.status_code,
                        response.text[:2000],
                    )
                    raise MCPClientError(
                        f"MCP request failed (status={response.status_code}, path={path})"
                    )

                try:
                    return response.json()
                except ValueError as exc:
                    self._last_upstream_error_detail = (
                        f"path={path} status={response.status_code} non_json_body={response.text[:2000]}"
                    )
                    logger.warning(
                        "MCP non-JSON response status=%s path=%s content_type=%s",
                        response.status_code,
                        path,
                        response.headers.get("Content-Type", ""),
                    )
                    logger.debug(
                        "MCP non-JSON response body path=%s status=%s body=%s",
                        path,
                        response.status_code,
                        response.text[:2000],
                    )
                    raise MCPClientError(
                        f"MCP returned non-JSON response (status={response.status_code}, path={path})"
                    ) from exc
            except Exception as exc:
                last_error = exc
                self._observe(
                    {
                        "event": "http_exception",
                        "method": method.upper(),
                        "path": path,
                        "attempt": attempt + 1,
                        "max_attempts": self.retry_max + 1,
                        "payload_keys": payload_keys,
                        "error_type": type(exc).__name__,
                    }
                )
                logger.warning(
                    "MCP request attempt failed path=%s attempt=%s/%s error_type=%s",
                    path,
                    attempt + 1,
                    self.retry_max + 1,
                    type(exc).__name__,
                )
                if attempt < self.retry_max:
                    time.sleep(0.25 * (attempt + 1))
                    continue

        logger.error(
            "MCP request exhausted retries path=%s error_type=%s",
            path,
            type(last_error).__name__ if last_error else "Unknown",
        )
        raise MCPClientError(f"MCP request error for {path}")

    def _ttl(self, ttl_seconds: int | None = None) -> int:
        if ttl_seconds is None:
            return self.cache_ttl_seconds
        return max(0, ttl_seconds)

    def get_system_prompt_template(self, ttl_seconds: int | None = None) -> str:
        effective_ttl = self._ttl(ttl_seconds)
        now = time.time()
        if self._prompt_cache and (now - self._prompt_cache_ts) < effective_ttl:
            self._observe(
                {
                    "event": "cache_hit",
                    "resource": "tonpixo_system_prompt",
                    "ttl_seconds": effective_ttl,
                }
            )
            return self._prompt_cache

        payload = self._request("GET", "/v1/resources/tonpixo_system_prompt")
        content = payload.get("content")
        if not isinstance(content, str) or not content.strip():
            raise MCPClientError("MCP system prompt resource is empty.")

        self._prompt_cache = content
        self._prompt_cache_ts = now
        return content

    def list_tools(self, ttl_seconds: int | None = None) -> list[str]:
        effective_ttl = self._ttl(ttl_seconds)
        now = time.time()
        if self._tools_cache is not None and (now - self._tools_cache_ts) < effective_ttl:
            self._observe(
                {
                    "event": "cache_hit",
                    "resource": "tools",
                    "ttl_seconds": effective_ttl,
                }
            )
            return self._tools_cache

        payload = self._request("GET", "/v1/tools")
        tools = payload.get("tools", [])
        if not isinstance(tools, list):
            raise MCPClientError("MCP tools list response is invalid.")
        parsed = [str(tool_name) for tool_name in tools]
        self._tools_cache = parsed
        self._tools_cache_ts = now
        return parsed

    def list_resources(self, ttl_seconds: int | None = None) -> list[str]:
        effective_ttl = self._ttl(ttl_seconds)
        now = time.time()
        if self._resources_cache is not None and (now - self._resources_cache_ts) < effective_ttl:
            self._observe(
                {
                    "event": "cache_hit",
                    "resource": "resources",
                    "ttl_seconds": effective_ttl,
                }
            )
            return self._resources_cache

        payload = self._request("GET", "/v1/resources")
        resources = payload.get("resources", [])
        if not isinstance(resources, list):
            raise MCPClientError("MCP resources list response is invalid.")
        parsed = [str(resource_name).strip() for resource_name in resources if str(resource_name).strip()]
        self._resources_cache = parsed
        self._resources_cache_ts = now
        return parsed

    def _resolve_resource_name(self, resource_name: str) -> str:
        normalized = (resource_name or "").strip().strip("/")
        if not normalized:
            raise MCPClientError("MCP resource name is required.")

        if normalized.startswith("resource://tonpixo/"):
            normalized = normalized.replace("resource://tonpixo/", "", 1).strip("/")

        if normalized == "system_prompt":
            return "tonpixo_system_prompt"
        if normalized.startswith("v1/resources/"):
            normalized = normalized.replace("v1/resources/", "", 1).strip("/")
        if normalized.startswith("resources/"):
            normalized = normalized.replace("resources/", "", 1).strip("/")

        if normalized == "tonpixo_system_prompt":
            return normalized
        if normalized.startswith("schema/"):
            return normalized
        if normalized.startswith("rules/"):
            return normalized
        if normalized.startswith("tool_description/"):
            return normalized

        raise MCPClientError(f"Unsupported MCP resource name: {resource_name}")

    def _resource_path(self, resolved_name: str) -> str:
        if resolved_name == "tonpixo_system_prompt":
            return "/v1/resources/tonpixo_system_prompt"

        category, _, item = resolved_name.partition("/")
        if not item:
            raise MCPClientError(f"Unsupported MCP resource name: {resolved_name}")
        return f"/v1/resources/{category}/{item}"

    def get_resource(self, resource_name: str, ttl_seconds: int | None = None) -> str:
        effective_ttl = self._ttl(ttl_seconds)
        resolved_name = self._resolve_resource_name(resource_name)
        now = time.time()
        cached = self._resource_content_cache.get(resolved_name)
        if cached and (now - cached[1]) < effective_ttl:
            self._observe(
                {
                    "event": "cache_hit",
                    "resource": resolved_name,
                    "ttl_seconds": effective_ttl,
                }
            )
            return cached[0]

        payload = self._request("GET", self._resource_path(resolved_name))
        content = payload.get("content")
        if not isinstance(content, str) or not content.strip():
            raise MCPClientError(f"MCP resource '{resolved_name}' is empty.")

        self._resource_content_cache[resolved_name] = (content, now)
        return content

    def sql_query(self, query: str, job_id: str) -> str:
        payload = self._request(
            "POST",
            "/v1/tools/sql_query",
            {"query": query, "job_id": job_id},
        )
        result = payload.get("result")
        if not isinstance(result, str):
            raise MCPClientError("MCP sql_query response is invalid.")
        return result

    def generate_chart_data(
        self,
        title: str,
        chart_type: str,
        data: list[dict[str, Any]],
        x_axis_key: str,
        data_keys: list[str],
    ) -> str:
        payload = self._request(
            "POST",
            "/v1/tools/generate_chart_data",
            {
                "title": title,
                "type": chart_type,
                "data": data,
                "xAxisKey": x_axis_key,
                "dataKeys": data_keys,
            },
        )
        result = payload.get("result")
        if not isinstance(result, str):
            raise MCPClientError("MCP generate_chart_data response is invalid.")
        return result


def _int_from_config(key: str, default: int) -> int:
    value = get_config_value(key, str(default))
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def set_mcp_request_observer(observer: MCPRequestObserver | None) -> None:
    global _mcp_request_observer
    _mcp_request_observer = observer

    cached_client = get_mcp_client.cache_info().currsize > 0
    if cached_client:
        try:
            get_mcp_client().request_observer = observer
        except Exception:
            pass


@lru_cache()
def get_mcp_client() -> MCPClient:
    base_url = _normalize_base_url(get_config_value("MCP_BASE_URL", os.environ.get("MCP_BASE_URL", "")))
    bearer_token = get_config_value("MCP_BEARER_TOKEN", os.environ.get("MCP_BEARER_TOKEN", ""))
    discovered = _discover_local_mcp_settings() if (not base_url or not bearer_token) else {}

    if not base_url and discovered.get("base_url"):
        base_url = discovered["base_url"]
        logger.info(
            "Auto-discovered local MCP base URL from sibling repo profile=%s source=%s repo_dir=%s",
            discovered.get("profile", "unknown"),
            discovered.get("base_url_source", "unknown"),
            discovered.get("repo_dir", "unknown"),
        )
    if not bearer_token and discovered.get("bearer_token"):
        bearer_token = discovered["bearer_token"]
        logger.info(
            "Auto-discovered MCP bearer token from sibling repo profile=%s repo_dir=%s",
            discovered.get("profile", "unknown"),
            discovered.get("repo_dir", "unknown"),
        )

    timeout_ms = _int_from_config("MCP_TIMEOUT_MS", 30000)
    retry_max = _int_from_config("MCP_RETRY_MAX", 2)
    cache_ttl_seconds = _int_from_config("MCP_CACHE_TTL_SECONDS", 900)

    return MCPClient(
        base_url=base_url,
        bearer_token=bearer_token,
        timeout_ms=timeout_ms,
        retry_max=retry_max,
        cache_ttl_seconds=cache_ttl_seconds,
        request_observer=_mcp_request_observer,
    )
