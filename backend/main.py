import boto3
import os
from dotenv import load_dotenv

from utils import get_config_value

# Load environment variables from .env file
load_dotenv()

import uuid
import json
import asyncio
import uvicorn
import requests
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from agent import process_chat, process_chat_stream, langfuse, flush_langfuse
from db import save_chat, save_message, get_user_chats, get_chat_messages, get_chat, save_favourite, remove_favourite, get_user_favourites, is_favourite

app = FastAPI()

# Note: CORS is handled by Lambda Function URL configuration in template.yaml
# Do NOT add CORSMiddleware here indefinitely - it will cause duplicate headers in production.
# We exclusively add it for local development (when not running in Lambda).
if not os.environ.get('AWS_LAMBDA_FUNCTION_NAME'):
    from fastapi.middleware.cors import CORSMiddleware
    print("Running locally - Adding CORS middleware")
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
    limit: int | None = None

class AccountSummaryRequest(BaseModel):
    address: str

class LoginRequest(BaseModel):
    initData: str

class ChatRequest(BaseModel):
    job_id: str
    question: str
    chat_id: str | None = None
    user_id: int | None = None

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
        # Get bot token from environment or secrets
        bot_token = get_config_value('TELEGRAM_BOT_TOKEN')
        
        # Skip validation in development mode if no bot token
        skip_validation = False
        if not bot_token or bot_token == 'YOUR_BOT_TOKEN_HERE':
            print("[LOGIN] WARNING: No TELEGRAM_BOT_TOKEN configured!")
            print("[LOGIN] Skipping signature validation (DEVELOPMENT MODE ONLY)")
            skip_validation = True
        
        # Also skip validation if using mock data (from local frontend)
        if "query_id=mock" in request.initData:
            print("[LOGIN] Mock data detected. Skipping signature validation.")
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
        'scan_type': request.scan_type,
        'limit': request.limit
    })
    
    message_body = json.dumps({
        'job_id': job_id, 
        'address': request.address,
        'scan_type': request.scan_type,
        'limit': request.limit
    })
    sqs.send_message(QueueUrl=QUEUE_URL, MessageBody=message_body)
    
    return {"job_id": job_id, "status": "queued", "scan_type": request.scan_type}

@app.post("/api/account_summary")
async def get_account_summary(request: AccountSummaryRequest):
    """Fetch account summary from TON API."""
    try:
        api_key = os.environ.get("TONAPI_KEY", "")
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        
        url = f"https://tonapi.io/v2/accounts/{request.address}"
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"Failed to fetch account info: {response.text}"}
            
    except Exception as e:
        print(f"[ACCOUNT_SUMMARY] Error: {e}")
        return {"error": str(e)}

@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    response = jobs_table.get_item(Key={'job_id': job_id})
    if 'Item' not in response:
        return {"status": "NOT_FOUND"}
    
    return response['Item']

@app.get("/api/history")
async def get_history(user_id: int, limit: int = 10, last_key: str = None):
    """Get chat history for a user with pagination."""
    import json
    import base64
    from db import get_user_chats_count
    
    # Decode last_key if provided (base64 encoded JSON)
    decoded_last_key = None
    if last_key:
        try:
            decoded_last_key = json.loads(base64.b64decode(last_key).decode('utf-8'))
        except Exception as e:
            print(f"Error decoding last_key: {e}")
    
    chats, next_key = get_user_chats(user_id, limit, decoded_last_key)
    
    # Debug: Log returned chats to diagnose duplicate issue
    chat_ids = [c.get('chat_id') for c in chats]
    print(f"[HISTORY] Returning {len(chats)} chats for user {user_id}: {chat_ids}")
    
    # Check for duplicates in the result
    unique_ids = set(chat_ids)
    if len(unique_ids) != len(chat_ids):
        print(f"[HISTORY] WARNING: Duplicate chat_ids detected! Unique: {len(unique_ids)}, Total: {len(chat_ids)}")
    
    # Enrich chats with last message preview
    from db import get_last_message
    enriched_chats = []
    for chat in chats:
        chat_data = dict(chat)
        last_msg = get_last_message(chat['chat_id'])
        if last_msg:
            content = last_msg.get('content', '')
            # Handle JSON content (like address details) - just show a simple preview
            if content.startswith('{'):
                chat_data['last_message'] = 'Address details...'
            else:
                # Truncate to 100 characters for preview
                chat_data['last_message'] = content[:100] + ('...' if len(content) > 100 else '')
            chat_data['last_message_role'] = last_msg.get('role', 'agent')
        enriched_chats.append(chat_data)
    
    # Get total count (only on first page load to avoid extra queries)
    total_count = None
    if not last_key:
        total_count = get_user_chats_count(user_id)
    
    # Encode next_key for client (base64 encoded JSON)
    encoded_next_key = None
    if next_key:
        encoded_next_key = base64.b64encode(json.dumps(next_key).encode('utf-8')).decode('utf-8')
    
    return {"chats": enriched_chats, "next_key": encoded_next_key, "total_count": total_count}

@app.get("/api/chat/{chat_id}/history")
async def get_chat_history(chat_id: str, user_id: int):
    """Get messages for a specific chat."""
    # Verify ownership first
    chat = get_chat(chat_id)
    if chat:
        if str(chat.get('user_id')) != str(user_id):
            return {"error": "Access denied", "messages": []}

    messages = get_chat_messages(chat_id)
    return {"messages": messages}

@app.get("/api/chat/{chat_id}")
async def get_chat_metadata(chat_id: str, user_id: int):
    """Get chat metadata."""
    chat = get_chat(chat_id)
    if not chat:
         return {"error": "Chat not found"}
    
    # Check ownership
    if str(chat.get('user_id')) != str(user_id):
        return {"error": "Access denied: You do not have permission to view this chat"}

    return chat

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
    
    # Save user message if chat_id provided
    if request.chat_id:
        # Check ownership if chat exists
        existing_chat = get_chat(request.chat_id)
        if existing_chat and request.user_id and str(existing_chat.get('user_id')) != str(request.user_id):
            return {"status": "error", "message": "Access denied"}

        save_message(request.chat_id, "user", request.question)
        if request.user_id:
            # Upsert chat to update timestamp
            save_chat(request.user_id, request.chat_id, f"Chat started {datetime.utcnow().isoformat()}", job_id=request.job_id)

    try:
        result = process_chat(request.job_id, request.question, user_id=str(request.user_id) if request.user_id else None, chat_id=request.chat_id)
        
        # Save agent message
        if request.chat_id:
            save_message(
                request.chat_id, 
                "agent", 
                result["content"], 
                trace_id=result["trace_id"]
            )
            
        return {"answer": result["content"], "trace_id": result["trace_id"], "status": "success"}
    except Exception as e:
        print(f"[CHAT] Error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream chat responses using Server-Sent Events."""
    print(f"[CHAT-STREAM] Received question for job {request.job_id}: {request.question}")
    
    # Save user message logic
    if request.chat_id:
        # Check ownership if chat exists
        existing_chat = get_chat(request.chat_id)
        if existing_chat and request.user_id and str(existing_chat.get('user_id')) != str(request.user_id):
             # For streaming, we yield an error event
             async def error_generator():
                 yield f"data: {json.dumps({'type': 'error', 'content': 'Access denied'})}\n\n"
             return StreamingResponse(error_generator(), media_type="text/event-stream")

        save_message(request.chat_id, "user", request.question)
        if request.user_id:
             # Only update timestamp and ensure user tracking - preserve existing title
             # The chat should already be initialized with a proper title by frontend
             if existing_chat:
                 # Chat exists - just update timestamp, keep existing title
                 save_chat(request.user_id, request.chat_id, title=existing_chat.get('title', 'New Chat'), job_id=request.job_id or existing_chat.get('job_id'))
             else:
                 # Chat doesn't exist - use question as title (fallback)
                 save_chat(request.user_id, request.chat_id, title=request.question[:50], job_id=request.job_id)

    async def generate():
        full_response = ""
        final_trace_id = None
        
        try:
            async for event in process_chat_stream(request.job_id, request.question, user_id=str(request.user_id) if request.user_id else None, chat_id=request.chat_id):
                event_type = event.get("type", "")
                
                if event_type == "token":
                    content = event["content"]
                    full_response += content
                    # Stream individual tokens
                    data = json.dumps({"type": "token", "content": content})
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
                    final_trace_id = event["content"]
                    data = json.dumps({"type": "trace_id", "content": final_trace_id})
                    yield f"data: {data}\n\n"
                
                elif event_type == "error":
                    # Error occurred
                    data = json.dumps({"type": "error", "content": event["content"]})
                    yield f"data: {data}\n\n"
                    
        except Exception as e:
            print(f"[CHAT-STREAM] Error: {e}")
            data = json.dumps({"type": "error", "content": str(e)})
            yield f"data: {data}\n\n"
        
        # Save complete agent response
        if full_response and request.chat_id:
             save_message(
                chat_id=request.chat_id,
                role="agent",
                content=full_response,
                trace_id=final_trace_id
            )
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

class InitChatRequest(BaseModel):
    chat_id: str
    user_id: int
    job_id: str | None = None
    title: str = "New Chat"
    address: str | None = None

@app.post("/api/chat/init")
async def init_chat(request: InitChatRequest):
    print(f"[CHAT] Initializing chat {request.chat_id} for user {request.user_id}")
    try:
        # Check if chat already exists
        existing_chat = get_chat(request.chat_id)
        if existing_chat:
            # If job_id is provided and chat exists, update to link the job
            if request.job_id:
                save_chat(request.user_id, request.chat_id, existing_chat.get('title', 'New Chat'), job_id=request.job_id, address=request.address or existing_chat.get('address'))
                return {"status": "ok", "message": "Chat updated with job_id"}
            return {"status": "ok", "message": "Chat already exists"}

        save_chat(request.user_id, request.chat_id, request.title, job_id=request.job_id, address=request.address)
        return {"status": "ok", "chat_id": request.chat_id}
    except Exception as e:
        print(f"[CHAT] Error initializing chat: {e}")
        return {"status": "error", "message": str(e)}


class SaveMessageRequest(BaseModel):
    role: str
    content: str
    trace_id: str | None = None

@app.post("/api/chat/{chat_id}/message")
async def manual_save_message(chat_id: str, request: SaveMessageRequest):
    """
    Manually save a message to a chat (used for system-generated messages like scan status).
    """
    print(f"[CHAT] Manually saving message to {chat_id}: {request.role}")
    try:
        msg_id = save_message(chat_id, request.role, request.content, request.trace_id)
        return {"status": "ok", "message_id": msg_id}
    except Exception as e:
        print(f"[CHAT] Error saving message: {e}")
        return {"status": "error", "message": str(e)}

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


# ========== FAVOURITES ENDPOINTS ==========

class FavouriteRequest(BaseModel):
    user_id: int
    address: str
    name: str | None = None

@app.post("/api/favourites")
async def add_favourite(request: FavouriteRequest):
    """Add an address to user's favourites."""
    print(f"[FAVOURITES] Adding {request.address} for user {request.user_id}")
    try:
        result = save_favourite(request.user_id, request.address, request.name)
        if result:
            return {"status": "ok", "address": result}
        return {"status": "error", "message": "Failed to save favourite"}
    except Exception as e:
        print(f"[FAVOURITES] Error: {e}")
        return {"status": "error", "message": str(e)}

@app.delete("/api/favourites/{address}")
async def delete_favourite(address: str, user_id: int):
    """Remove an address from user's favourites."""
    print(f"[FAVOURITES] Removing {address} for user {user_id}")
    try:
        result = remove_favourite(user_id, address)
        if result:
            return {"status": "ok"}
        return {"status": "error", "message": "Failed to remove favourite"}
    except Exception as e:
        print(f"[FAVOURITES] Error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/favourites")
async def list_favourites(user_id: int, limit: int = 50):
    """Get all favourites for a user."""
    print(f"[FAVOURITES] Listing for user {user_id}")
    try:
        favourites = get_user_favourites(user_id, limit)
        return {"favourites": favourites, "count": len(favourites)}
    except Exception as e:
        print(f"[FAVOURITES] Error: {e}")
        return {"favourites": [], "count": 0, "error": str(e)}

@app.get("/api/favourites/check/{address}")
async def check_favourite(address: str, user_id: int):
    """Check if an address is in user's favourites."""
    try:
        is_fav = is_favourite(user_id, address)
        return {"is_favourite": is_fav}
    except Exception as e:
        print(f"[FAVOURITES] Error: {e}")
        return {"is_favourite": False, "error": str(e)}


# Lambda Web Adapter: Run FastAPI with uvicorn
# The adapter starts the app and translates Lambda events to HTTP requests
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)