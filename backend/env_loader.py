import os
from pathlib import Path

from dotenv import load_dotenv

BRANCH_TO_PROFILE = {
    "dev": "dev",
    "development": "dev",
    "main": "main",
    "master": "main",
}


def _normalize(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    return normalized or None


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


def load_project_env(base_dir: str | Path | None = None) -> list[str]:
    env_dir = Path(base_dir) if base_dir else Path(__file__).resolve().parent
    repo_root = env_dir.parent

    explicit_profile = _normalize(os.getenv("TONPIXO_ENV") or os.getenv("APP_ENV"))
    branch_profile = None
    if not explicit_profile:
        branch_name = _normalize(_detect_git_branch(repo_root))
        branch_profile = BRANCH_TO_PROFILE.get(branch_name or "")

    selected_profile = explicit_profile or branch_profile

    candidate_files: list[str] = []
    if selected_profile:
        candidate_files.append(f".env.{selected_profile}")
    candidate_files.extend([".env.local", ".env"])

    loaded_files: list[str] = []
    seen: set[str] = set()
    for filename in candidate_files:
        if filename in seen:
            continue
        seen.add(filename)

        env_file = env_dir / filename
        if env_file.exists():
            load_dotenv(dotenv_path=env_file, override=False)
            loaded_files.append(filename)

    return loaded_files