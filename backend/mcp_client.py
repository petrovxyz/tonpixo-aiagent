import os
import time
import logging
from functools import lru_cache
from typing import Any

import requests

from utils import get_config_value

logger = logging.getLogger(__name__)


class MCPClientError(RuntimeError):
    """Raised when MCP service interaction fails."""


class MCPClient:
    def __init__(
        self,
        base_url: str,
        bearer_token: str,
        timeout_ms: int = 20000,
        retry_max: int = 2,
    ):
        self.base_url = (base_url or "").rstrip("/")
        self.bearer_token = bearer_token or ""
        self.timeout_seconds = max(1, timeout_ms // 1000) if timeout_ms else 20
        self.retry_max = max(0, retry_max)
        self._prompt_cache: str | None = None
        self._prompt_cache_ts = 0.0
        self._tools_cache: list[str] | None = None
        self._tools_cache_ts = 0.0
        # Debug-only storage for latest upstream error details (never raised to callers).
        self._last_upstream_error_detail: str | None = None

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"
        return headers

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        if not self.base_url:
            raise MCPClientError("MCP_BASE_URL is not configured.")

        url = f"{self.base_url}{path}"
        last_error: Exception | None = None

        for attempt in range(self.retry_max + 1):
            try:
                response = requests.request(
                    method=method,
                    url=url,
                    headers=self._headers(),
                    json=payload,
                    timeout=self.timeout_seconds,
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

    def get_system_prompt_template(self, ttl_seconds: int = 300) -> str:
        now = time.time()
        if self._prompt_cache and (now - self._prompt_cache_ts) < ttl_seconds:
            return self._prompt_cache

        payload = self._request("GET", "/v1/resources/tonpixo_system_prompt")
        content = payload.get("content")
        if not isinstance(content, str) or not content.strip():
            raise MCPClientError("MCP system prompt resource is empty.")

        self._prompt_cache = content
        self._prompt_cache_ts = now
        return content

    def list_tools(self, ttl_seconds: int = 300) -> list[str]:
        now = time.time()
        if self._tools_cache is not None and (now - self._tools_cache_ts) < ttl_seconds:
            return self._tools_cache

        payload = self._request("GET", "/v1/tools")
        tools = payload.get("tools", [])
        if not isinstance(tools, list):
            raise MCPClientError("MCP tools list response is invalid.")
        parsed = [str(tool_name) for tool_name in tools]
        self._tools_cache = parsed
        self._tools_cache_ts = now
        return parsed

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


@lru_cache()
def get_mcp_client() -> MCPClient:
    base_url = get_config_value("MCP_BASE_URL", os.environ.get("MCP_BASE_URL", ""))
    bearer_token = get_config_value("MCP_BEARER_TOKEN", os.environ.get("MCP_BEARER_TOKEN", ""))
    timeout_ms = _int_from_config("MCP_TIMEOUT_MS", 20000)
    retry_max = _int_from_config("MCP_RETRY_MAX", 2)

    return MCPClient(
        base_url=base_url,
        bearer_token=bearer_token,
        timeout_ms=timeout_ms,
        retry_max=retry_max,
    )
