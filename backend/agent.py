import os
import boto3
import pandas as pd
from io import StringIO
from botocore.config import Config
from langchain_aws import ChatBedrock
from langchain_experimental.agents import create_pandas_dataframe_agent
from langchain.agents.agent_types import AgentType

# Configuration
BUCKET_NAME = os.environ.get('DATA_BUCKET')

# Retry configuration for throttling handling
BEDROCK_RETRY_CONFIG = Config(
    retries={
        'max_attempts': 10,           # Maximum retry attempts
        'mode': 'adaptive'            # Adaptive retry mode with exponential backoff
    },
    read_timeout=120,                 # Read timeout in seconds
    connect_timeout=10                # Connection timeout in seconds
)

s3 = boto3.client('s3')
bedrock_runtime = boto3.client('bedrock-runtime', config=BEDROCK_RETRY_CONFIG)

def get_csv_from_s3(job_id: str) -> pd.DataFrame:
    """Download CSV from S3 and load into DataFrame."""
    try:
        if not BUCKET_NAME:
            # Fallback for local testing if no bucket env var
            print("WARNING: DATA_BUCKET env var not set. Trying local file.")
            local_path = f"exports/{job_id}.csv"
            if os.path.exists(local_path):
                return pd.read_csv(local_path)
            raise Exception("DATA_BUCKET not set and local file not found")

        file_key = f"exports/{job_id}.csv"
        response = s3.get_object(Bucket=BUCKET_NAME, Key=file_key)
        csv_content = response['Body'].read().decode('utf-8')
        df = pd.read_csv(StringIO(csv_content))
        return df
    except Exception as e:
        print(f"Error loading CSV for job {job_id}: {e}")
        raise e

def process_chat(job_id: str, question: str) -> str:
    """
    Initialize agent with data for job_id and answer the question.
    """
    try:
        df = get_csv_from_s3(job_id)
        
        # Initialize Bedrock Chat Model with retry-configured client
        llm = ChatBedrock(
            model_id="arn:aws:bedrock:us-east-1:156027872245:inference-profile/global.anthropic.claude-sonnet-4-5-20250929-v1:0",
            provider="anthropic",
            client=bedrock_runtime,
            model_kwargs={"temperature": 0.0}
        )
        
        # Create Pandas Agent
        agent = create_pandas_dataframe_agent(
            llm,
            df,
            verbose=True,
            agent_type=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
            allow_dangerous_code=True # Required for pandas agent to execute Python
        )
        
        # Run the agent
        response = agent.run(question)
        return response
        
    except Exception as e:
        print(f"Agent error: {e}")
        return f"I encountered an error analyzing the data: {str(e)}"
