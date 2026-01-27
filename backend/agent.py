import os
import boto3
import pandas as pd
from io import StringIO
from typing import Annotated, TypedDict, Literal
from botocore.config import Config
from langchain_aws import ChatBedrock
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_community.callbacks.manager import get_bedrock_anthropic_callback

# Configuration
BUCKET_NAME = os.environ.get('DATA_BUCKET')

# Retry configuration for throttling handling
BEDROCK_RETRY_CONFIG = Config(
    retries={
        'max_attempts': 10,
        'mode': 'adaptive'
    },
    read_timeout=120,
    connect_timeout=10
)

s3 = boto3.client('s3')
cw = boto3.client('cloudwatch')
bedrock_runtime = boto3.client('bedrock-runtime', config=BEDROCK_RETRY_CONFIG)

# Global dataframe cache for the current session
_dataframe_cache: dict[str, pd.DataFrame] = {}


def log_metrics_to_cloudwatch(cb, job_id):
    """Send cost and tokens to AWS CloudWatch"""
    try:
        cw.put_metric_data(
            Namespace='Tonpixo/LLM',
            MetricData=[
                {
                    'MetricName': 'TotalCost',
                    'Dimensions': [
                        {'Name': 'Model', 'Value': 'Claude3.5Sonnet'}
                    ],
                    'Value': cb.total_cost,
                    'Unit': 'Count'
                },
                {
                    'MetricName': 'InputTokens',
                    'Value': cb.prompt_tokens,
                    'Unit': 'Count'
                },
                {
                    'MetricName': 'OutputTokens',
                    'Value': cb.completion_tokens,
                    'Unit': 'Count'
                }
            ]
        )
        print(f"Metrics sent: ${cb.total_cost}")
    except Exception as e:
        print(f"Failed to send metrics: {e}")


def get_csv_from_s3(job_id: str) -> pd.DataFrame:
    """Download CSV from S3 and load into DataFrame."""
    # Check cache first
    if job_id in _dataframe_cache:
        return _dataframe_cache[job_id]
    
    # Try different scan_type suffixes
    scan_types = ['transactions', 'jettons', 'nfts']
    
    try:
        if not BUCKET_NAME:
            print("WARNING: DATA_BUCKET env var not set. Trying local file.")
            # Try with scan_type suffix first, then fallback to old format
            for scan_type in scan_types:
                local_path = f"exports/{job_id}_{scan_type}.csv"
                if os.path.exists(local_path):
                    df = pd.read_csv(local_path)
                    _dataframe_cache[job_id] = df
                    return df
            # Fallback to old format
            local_path = f"exports/{job_id}.csv"
            if os.path.exists(local_path):
                df = pd.read_csv(local_path)
                _dataframe_cache[job_id] = df
                return df
            raise Exception("DATA_BUCKET not set and local file not found")

        # Try with scan_type suffix first
        for scan_type in scan_types:
            try:
                file_key = f"exports/{job_id}_{scan_type}.csv"
                response = s3.get_object(Bucket=BUCKET_NAME, Key=file_key)
                csv_content = response['Body'].read().decode('utf-8')
                df = pd.read_csv(StringIO(csv_content))
                _dataframe_cache[job_id] = df
                return df
            except s3.exceptions.NoSuchKey:
                continue
            except Exception as e:
                if 'NoSuchKey' in str(e):
                    continue
                raise e
        
        # Fallback to old format for backward compatibility
        file_key = f"exports/{job_id}.csv"
        response = s3.get_object(Bucket=BUCKET_NAME, Key=file_key)
        csv_content = response['Body'].read().decode('utf-8')
        df = pd.read_csv(StringIO(csv_content))
        _dataframe_cache[job_id] = df
        return df
    except Exception as e:
        print(f"Error loading CSV for job {job_id}: {e}")
        raise e


# ============== LangGraph Agent State ==============

class AgentState(TypedDict):
    """The state of the agent."""
    messages: Annotated[list[BaseMessage], add_messages]
    job_id: str
    dataframe_info: str
    final_answer: str


# ============== Tools for Data Analysis ==============

def create_data_tools(job_id: str):
    """Create tools with access to the specific job's dataframe."""
    
    @tool
    def get_dataframe_info() -> str:
        """Get information about the dataframe structure including columns, dtypes, and sample data."""
        try:
            df = get_csv_from_s3(job_id)
            info = []
            info.append(f"Shape: {df.shape[0]} rows, {df.shape[1]} columns")
            info.append(f"\nColumns and types:\n{df.dtypes.to_string()}")
            info.append(f"\nFirst 5 rows:\n{df.head().to_string()}")
            info.append(f"\nBasic statistics:\n{df.describe().to_string()}")
            return "\n".join(info)
        except Exception as e:
            return f"Error getting dataframe info: {e}"

    @tool
    def query_dataframe(query: str) -> str:
        """Execute a pandas query or operation on the dataframe and return results.
        
        Args:
            query: A Python expression to evaluate on the dataframe 'df'. 
                   Examples: 
                   - "df['column'].sum()" 
                   - "df[df['amount'] > 100]"
                   - "df.groupby('type').count()"
                   - "len(df[df['status'] == 'completed'])"
        """
        try:
            df = get_csv_from_s3(job_id)
            # Execute the query in a safe context
            result = eval(query, {"df": df, "pd": pd})
            if isinstance(result, pd.DataFrame):
                if len(result) > 20:
                    return f"Result (first 20 of {len(result)} rows):\n{result.head(20).to_string()}"
                return result.to_string()
            elif isinstance(result, pd.Series):
                if len(result) > 20:
                    return f"Result (first 20 of {len(result)} items):\n{result.head(20).to_string()}"
                return result.to_string()
            else:
                return str(result)
        except Exception as e:
            return f"Error executing query: {e}"

    @tool
    def get_column_unique_values(column_name: str) -> str:
        """Get unique values for a specific column.
        
        Args:
            column_name: The name of the column to get unique values for.
        """
        try:
            df = get_csv_from_s3(job_id)
            if column_name not in df.columns:
                return f"Column '{column_name}' not found. Available columns: {list(df.columns)}"
            unique_vals = df[column_name].unique()
            if len(unique_vals) > 50:
                return f"Column has {len(unique_vals)} unique values. First 50: {list(unique_vals[:50])}"
            return f"Unique values ({len(unique_vals)}): {list(unique_vals)}"
        except Exception as e:
            return f"Error getting unique values: {e}"

    @tool
    def aggregate_data(column: str, operation: str, group_by: str = None) -> str:
        """Perform aggregation operations on the data.
        
        Args:
            column: The column to aggregate.
            operation: The operation to perform (sum, mean, count, min, max, std).
            group_by: Optional column to group by before aggregating.
        """
        try:
            df = get_csv_from_s3(job_id)
            if column not in df.columns:
                return f"Column '{column}' not found. Available: {list(df.columns)}"
            
            valid_ops = ['sum', 'mean', 'count', 'min', 'max', 'std']
            if operation not in valid_ops:
                return f"Invalid operation. Use one of: {valid_ops}"
            
            if group_by:
                if group_by not in df.columns:
                    return f"Group by column '{group_by}' not found."
                result = getattr(df.groupby(group_by)[column], operation)()
            else:
                result = getattr(df[column], operation)()
            
            if isinstance(result, pd.Series) and len(result) > 30:
                return f"Result (first 30 of {len(result)}):\n{result.head(30).to_string()}"
            return str(result)
        except Exception as e:
            return f"Error aggregating data: {e}"

    @tool  
    def filter_and_count(column: str, condition: str, value: str) -> str:
        """Filter data by a condition and return count and sample.
        
        Args:
            column: The column to filter on.
            condition: The condition (equals, contains, greater_than, less_than, not_equals).
            value: The value to compare against.
        """
        try:
            df = get_csv_from_s3(job_id)
            if column not in df.columns:
                return f"Column '{column}' not found. Available: {list(df.columns)}"
            
            if condition == 'equals':
                filtered = df[df[column] == value]
            elif condition == 'not_equals':
                filtered = df[df[column] != value]
            elif condition == 'contains':
                filtered = df[df[column].astype(str).str.contains(value, case=False, na=False)]
            elif condition == 'greater_than':
                filtered = df[df[column] > float(value)]
            elif condition == 'less_than':
                filtered = df[df[column] < float(value)]
            else:
                return f"Invalid condition. Use: equals, not_equals, contains, greater_than, less_than"
            
            result = f"Found {len(filtered)} matching rows"
            if len(filtered) > 0:
                result += f"\n\nSample (first 5):\n{filtered.head().to_string()}"
            return result
        except Exception as e:
            return f"Error filtering data: {e}"

    return [get_dataframe_info, query_dataframe, get_column_unique_values, aggregate_data, filter_and_count]


# ============== LangGraph Nodes ==============

def create_agent_graph(job_id: str):
    """Create a LangGraph agent for analyzing financial data."""
    
    # Initialize LLM
    llm = ChatBedrock(
        model_id="arn:aws:bedrock:us-east-1:156027872245:inference-profile/global.anthropic.claude-sonnet-4-5-20250929-v1:0",
        provider="anthropic",
        client=bedrock_runtime,
        model_kwargs={"temperature": 0.0}
    )
    
    # Create tools
    tools = create_data_tools(job_id)
    llm_with_tools = llm.bind_tools(tools)
    
    # System message for the agent
    system_prompt = """You are an expert financial data analyst. You analyze transaction data from a CSV file to answer user questions.

Your core responsibilities:
1. Accurately analyze the data using the provided tools
2. Give concise, helpful, and friendly answers
3. Always base your answers on actual data - never make up information
4. If data is not available or relevant, clearly state that

Available tools:
- get_dataframe_info: Get structure and sample of the data
- query_dataframe: Execute pandas operations for complex analysis
- get_column_unique_values: See what values exist in a column
- aggregate_data: Perform sum, mean, count, min, max, std operations
- filter_and_count: Filter data by conditions

Workflow:
1. First understand the data structure using get_dataframe_info if needed
2. Use appropriate tools to find the answer
3. Present results clearly and concisely

Important:
- Do not answer questions unrelated to the data
- Round numeric results to appropriate precision
- When showing large results, summarize key findings"""

    # Agent node - decides what to do
    def agent_node(state: AgentState) -> AgentState:
        """The main agent node that reasons and decides actions."""
        messages = state["messages"]
        
        # Add system message if not present
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [SystemMessage(content=system_prompt)] + list(messages)
        
        response = llm_with_tools.invoke(messages)
        return {"messages": [response]}
    
    # Determine next step
    def should_continue(state: AgentState) -> Literal["tools", "end"]:
        """Determine if we should use tools or end."""
        last_message = state["messages"][-1]
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "tools"
        return "end"
    
    # Tool execution node
    tool_node = ToolNode(tools)
    
    # Build the graph
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", tool_node)
    
    # Set entry point
    workflow.set_entry_point("agent")
    
    # Add edges
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "tools": "tools",
            "end": END
        }
    )
    workflow.add_edge("tools", "agent")
    
    # Compile
    return workflow.compile()


def process_chat(job_id: str, question: str) -> str:
    """
    Process a chat message using the LangGraph agent.
    """
    try:
        # Create the agent graph
        agent = create_agent_graph(job_id)
        
        # Initialize state with the user's question
        initial_state = {
            "messages": [HumanMessage(content=question)],
            "job_id": job_id,
            "dataframe_info": "",
            "final_answer": ""
        }
        
        with get_bedrock_anthropic_callback() as cb:
            # Run the agent
            result = agent.invoke(initial_state, {"recursion_limit": 25})
            
            # Log metrics
            log_metrics_to_cloudwatch(cb, job_id)
            
            # Extract final answer from the last AI message
            for message in reversed(result["messages"]):
                if isinstance(message, AIMessage) and message.content:
                    # Skip messages that are just tool calls
                    if not (hasattr(message, "tool_calls") and message.tool_calls and not message.content):
                        return message.content
            
            return "I couldn't generate a response."
        
    except Exception as e:
        print(f"Agent error: {e}")
        import traceback
        traceback.print_exc()
        return f"I encountered an error analyzing the data: {str(e)}"


# ============== Streaming Support ==============

async def process_chat_stream(job_id: str, question: str):
    """
    Process a chat message using the LangGraph agent with streaming.
    Yields chunks of the response as they are generated.
    """
    try:
        # Create the agent graph
        agent = create_agent_graph(job_id)
        
        # Initialize state
        initial_state = {
            "messages": [HumanMessage(content=question)],
            "job_id": job_id,
            "dataframe_info": "",
            "final_answer": ""
        }
        
        with get_bedrock_anthropic_callback() as cb:
            # Stream the agent execution
            async for event in agent.astream_events(initial_state, {"recursion_limit": 25}, version="v2"):
                kind = event["event"]
                
                if kind == "on_chat_model_stream":
                    # Stream token-by-token output
                    chunk = event["data"]["chunk"]
                    content = chunk.content
                    
                    # Handle different content formats from Claude
                    if content:
                        text_content = ""
                        
                        # Content can be a string or a list of content blocks
                        if isinstance(content, str):
                            text_content = content
                        elif isinstance(content, list):
                            # Extract text from content blocks
                            for block in content:
                                if isinstance(block, str):
                                    text_content += block
                                elif isinstance(block, dict) and block.get("type") == "text":
                                    text_content += block.get("text", "")
                                elif hasattr(block, "text"):
                                    text_content += block.text
                        
                        if text_content:
                            yield {"type": "token", "content": text_content}
                
                elif kind == "on_tool_start":
                    # Tool is starting
                    tool_name = event["name"]
                    yield {"type": "tool_start", "tool": tool_name}
                
                elif kind == "on_tool_end":
                    # Tool finished
                    yield {"type": "tool_end", "tool": event["name"]}
            
            # Log metrics after completion
            log_metrics_to_cloudwatch(cb, job_id)
            yield {"type": "done"}
            
    except Exception as e:
        print(f"Streaming agent error: {e}")
        import traceback
        traceback.print_exc()
        yield {"type": "error", "content": f"I encountered an error: {str(e)}"}

