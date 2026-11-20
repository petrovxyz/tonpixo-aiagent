import os
import sys
from pathlib import Path

# Make backend modules importable as top-level modules (as in the Docker image).
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# Set before any backend import: dotenv does not override existing variables, so
# no real keys from a local .env file are used and nothing is sent to Langfuse Cloud.
os.environ.pop("SECRET_NAME", None)
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ["LANGFUSE_PUBLIC_KEY"] = "pk-lf-unit-test"
os.environ["LANGFUSE_SECRET_KEY"] = "sk-lf-unit-test"
os.environ["LANGFUSE_HOST"] = "http://127.0.0.1:9"
os.environ["LANGFUSE_TRACING_ENVIRONMENT"] = "tonpixo-unit-test"
for _table_var in ("JOBS_TABLE", "USERS_TABLE", "CHATS_TABLE", "MESSAGES_TABLE", "FAVOURITES_TABLE"):
    os.environ.setdefault(_table_var, f"unit-test-{_table_var.lower()}")
