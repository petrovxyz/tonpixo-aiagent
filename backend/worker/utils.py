import boto3
import json
import os
from functools import lru_cache

@lru_cache()
def get_secret(secret_name: str = None) -> dict:
    """
    Fetch secrets from AWS Secrets Manager.
    Uses generic cache to avoid calling AWS on every request.
    """
    if not secret_name:
        secret_name = os.environ.get("SECRET_NAME")
        
    if not secret_name:
        print("WARNING: SECRET_NAME environment variable not set. Using local environment variables.")
        return {}

    try:
        session = boto3.session.Session()
        client = session.client(
            service_name='secretsmanager'
        )
        
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )
        
        if 'SecretString' in get_secret_value_response:
            return json.loads(get_secret_value_response['SecretString'])
        else:
            return json.loads(get_secret_value_response['SecretBinary'])
            
    except Exception as e:
        print(f"Error fetching secret '{secret_name}': {e}")
        # Return empty dict so code falls back to os.environ if needed, or fails gracefully
        return {}

def get_config_value(key: str, default: str = None) -> str:
    """
    Get configuration value from Secrets Manager, falling back to Environment variables.
    """
    # Try getting from cached secrets
    secrets = get_secret()
    value = secrets.get(key)
    
    # Fallback to environment variable
    if value is None:
        value = os.environ.get(key)
        
    # Fallback to default
    if value is None:
        value = default
        
    return value
