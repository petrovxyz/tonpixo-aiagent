import boto3
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

import uuid
import json
import asyncio
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from agent import process_chat, process_chat_stream, langfuse, flush_langfuse

app = FastAPI()

# CORS middleware - Lambda Web Adapter handles HTTP properly so standard middleware works
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
sqs = boto3.client('sqs')
dynamodb = boto3.resource('dynamodb')

QUEUE_URL = os.environ.get('JOBS_QUEUE_URL')
TABLE_NAME = os.environ.get('JOBS_TABLE')
USERS_TABLE_NAME = os.environ.get('USERS_TABLE')

jobs_table = dynamodb.Table(TABLE_NAME)
users_table = dynamodb.Table(USERS_TABLE_NAME)

class GenerateRequest(BaseModel):
    address: str
    scan_type: str = "transactions"  # transactions, jettons, nfts

class LoginRequest(BaseModel):
    initData: str

class ChatRequest(BaseModel):
    job_id: str
    question: str

class ScoreRequest(BaseModel):
    trace_id: str
    score: float
    comment: str | None = None
    name: str | None = None


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok", 
        "message": "Server is running",
        "timestamp": str(uuid.uuid4())
    }


def validate_telegram_init_data(init_data: str, bot_token: str) -> tuple[bool, dict | None, str]:
    """
    Validate Telegram Mini App initData according to official documentation.
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    
    Returns: (is_valid, parsed_data, error_message)
    """
    import hmac
    import hashlib
    from urllib.parse import parse_qs, unquote
    import time
    
    try:
        # Parse the init data
        parsed = {}
        for pair in init_data.split('&'):
            if '=' in pair:
                key, value = pair.split('=', 1)
                parsed[key] = unquote(value)
        
        # Extract the hash
        received_hash = parsed.pop('hash', None)
        if not received_hash:
            return False, None, "No hash found in initData"
        
        # Create the data check string (sorted alphabetically)
        data_check_string = '\n'.join(
            f'{key}={value}' 
            for key, value in sorted(parsed.items())
        )
        
        # Create secret key: HMAC-SHA256 of bot token with "WebAppData" as key
        secret_key = hmac.new(
            b'WebAppData',
            bot_token.encode(),
            hashlib.sha256
        ).digest()
        
        # Calculate expected hash
        expected_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256
        ).hexdigest()
        
        # Compare hashes
        if not hmac.compare_digest(expected_hash, received_hash):
            return False, None, "Invalid signature"
        
        # Validate auth_date (prevent replay attacks - 1 hour expiry)
        auth_date = parsed.get('auth_date')
        if auth_date:
            auth_timestamp = int(auth_date)
            current_timestamp = int(time.time())
            if current_timestamp - auth_timestamp > 3600:  # 1 hour
                return False, None, "Auth data expired"
        
        return True, parsed, ""
        
    except Exception as e:
        return False, None, f"Validation error: {str(e)}"


@app.post("/api/login")
async def login(request: LoginRequest):
    from urllib.parse import parse_qs
    import json
    from datetime import datetime
    
    print(f"[LOGIN] Received login request")
    print(f"[LOGIN] initData length: {len(request.initData)}")
    
    try:
        # Get bot token from environment
        bot_token = os.environ.get('TELEGRAM_BOT_TOKEN')
        
        # Skip validation in development mode if no bot token
        skip_validation = False
        if not bot_token or bot_token == 'YOUR_BOT_TOKEN_HERE':
            print("[LOGIN] WARNING: No TELEGRAM_BOT_TOKEN configured!")
            print("[LOGIN] Skipping signature validation (DEVELOPMENT MODE ONLY)")
            skip_validation = True
        
        # Validate initData signature (CRITICAL SECURITY CHECK)
        if not skip_validation:
            is_valid, validated_data, error_msg = validate_telegram_init_data(
                request.initData, 
                bot_token
            )
            
            if not is_valid:
                print(f"[LOGIN] SECURITY: Invalid initData - {error_msg}")
                return {"status": "error", "message": f"Authentication failed: {error_msg}"}
            
            print("[LOGIN] Signature validation successful")
            user_json = validated_data.get('user')
        else:
            # Development fallback - parse without validation
            parsed_data = parse_qs(request.initData)
            user_json = parsed_data.get('user', [None])[0]
        
        if not user_json:
            print("[LOGIN] ERROR: No user data found in initData")
            return {"status": "error", "message": "No user data found"}
            
        user_data = json.loads(user_json)
        print(f"[LOGIN] User data: {user_data}")
        
        telegram_id = user_data.get('id')
        
        if not telegram_id:
            print("[LOGIN] ERROR: No telegram_id found in user data")
            return {"status": "error", "message": "No telegram_id found"}
             
        # Upsert user (with error handling for local dev without AWS)
        try:
            users_table.put_item(Item={
                'telegram_id': telegram_id,
                'first_name': user_data.get('first_name', ''),
                'last_name': user_data.get('last_name', ''),
                'username': user_data.get('username', ''),
                'language_code': user_data.get('language_code', ''),
                'photo_url': user_data.get('photo_url', ''),
                'last_login': datetime.utcnow().isoformat()
            })
            print(f"[LOGIN] User {telegram_id} saved to DynamoDB")
        except Exception as db_error:
            print(f"[LOGIN] WARNING: Could not save to DynamoDB (local dev?): {db_error}")
            # Continue anyway - this is just for tracking
        
        print(f"[LOGIN] SUCCESS: User {telegram_id} logged in")
        return {"status": "ok", "user": user_data}
        
    except Exception as e:
        import traceback
        print(f"[LOGIN] ERROR: {e}")
        print(f"[LOGIN] Traceback: {traceback.format_exc()}")
        return {"status": "error", "message": str(e)}


@app.post("/api/generate")
async def start_job(request: GenerateRequest):
    job_id = str(uuid.uuid4())
    
    jobs_table.put_item(Item={
        'job_id': job_id,
        'status': 'queued',
        'address': request.address,
        'scan_type': request.scan_type
    })
    
    message_body = json.dumps({
        'job_id': job_id, 
        'address': request.address,
        'scan_type': request.scan_type
    })
    sqs.send_message(QueueUrl=QUEUE_URL, MessageBody=message_body)
    
    return {"job_id": job_id, "status": "queued", "scan_type": request.scan_type}

@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    response = jobs_table.get_item(Key={'job_id': job_id})
    if 'Item' not in response:
        return {"status": "NOT_FOUND"}
    
    return response['Item']

@app.post("/api/cancel/{job_id}")
async def cancel_job(job_id: str):
    """Cancel a running or queued job."""
    print(f"[CANCEL] Cancelling job {job_id}")
    try:
        # Update job status to cancelled
        jobs_table.update_item(
            Key={'job_id': job_id},
            UpdateExpression="set #s = :s",
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={':s': 'cancelled'}
        )
        return {"status": "cancelled", "job_id": job_id}
    except Exception as e:
        print(f"[CANCEL] Error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/api/chat")
async def chat(request: ChatRequest):
    print(f"[CHAT] Received question for job {request.job_id}: {request.question}")
    try:
        result = process_chat(request.job_id, request.question)
        return {"answer": result["content"], "trace_id": result["trace_id"], "status": "success"}
    except Exception as e:
        print(f"[CHAT] Error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream chat responses using Server-Sent Events."""
    print(f"[CHAT-STREAM] Received question for job {request.job_id}: {request.question}")
    
    async def generate():
        try:
            async for event in process_chat_stream(request.job_id, request.question):
                event_type = event.get("type", "")
                
                if event_type == "token":
                    # Stream individual tokens
                    data = json.dumps({"type": "token", "content": event["content"]})
                    yield f"data: {data}\n\n"
                
                elif event_type == "tool_start":
                    # Agent is using a tool
                    data = json.dumps({"type": "tool_start", "tool": event["tool"]})
                    yield f"data: {data}\n\n"
                
                elif event_type == "tool_end":
                    # Tool execution completed
                    data = json.dumps({"type": "tool_end", "tool": event["tool"]})
                    yield f"data: {data}\n\n"
                
                elif event_type == "done":
                    # Streaming complete
                    data = json.dumps({"type": "done"})
                    yield f"data: {data}\n\n"

                elif event_type == "trace_id":
                    # Trace ID received
                    data = json.dumps({"type": "trace_id", "content": event["content"]})
                    yield f"data: {data}\n\n"
                
                elif event_type == "error":
                    # Error occurred
                    data = json.dumps({"type": "error", "content": event["content"]})
                    yield f"data: {data}\n\n"
                    
        except Exception as e:
            print(f"[CHAT-STREAM] Error: {e}")
            data = json.dumps({"type": "error", "content": str(e)})
            yield f"data: {data}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.post("/api/score")
async def score_trace(request: ScoreRequest):
    """
    Record a score for a specific trace in Langfuse.
    """
    print(f"[SCORE] Received score for trace {request.trace_id}: {request.score}")
    try:
        langfuse.create_score(
            trace_id=request.trace_id,
            name=request.name or "user-feedback",
            value=request.score,
            comment=request.comment
        )
        # Flush to ensure score is sent immediately
        flush_langfuse()
        return {"status": "success"}
    except Exception as e:
        print(f"[SCORE] Error recording score: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}


# Lambda Web Adapter: Run FastAPI with uvicorn
# The adapter starts the app and translates Lambda events to HTTP requests
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)