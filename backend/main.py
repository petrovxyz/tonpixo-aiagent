import boto3
import os
import uuid
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from mangum import Mangum

app = FastAPI()
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

class LoginRequest(BaseModel):
    initData: str

@app.post("/api/login")
async def login(request: LoginRequest):
    from urllib.parse import parse_qs
    import json
    
    try:
        # Parse initData
        parsed_data = parse_qs(request.initData)
        user_json = parsed_data.get('user', [None])[0]
        
        if not user_json:
            return {"status": "error", "message": "No user data found"}
            
        user_data = json.loads(user_json)
        telegram_id = user_data.get('id')
        
        if not telegram_id:
             return {"status": "error", "message": "No telegram_id found"}
             
        # Upsert user
        users_table.put_item(Item={
            'telegram_id': telegram_id,
            'first_name': user_data.get('first_name', ''),
            'last_name': user_data.get('last_name', ''),
            'username': user_data.get('username', ''),
            'language_code': user_data.get('language_code', ''),
            'photo_url': user_data.get('photo_url', ''),
            'last_login': str(uuid.uuid4()) # simple timestamp placeholder or similar
        })
        
        return {"status": "ok", "user": user_data}
        
    except Exception as e:
        print(f"Login error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/generate")
async def start_job(request: GenerateRequest):
    job_id = str(uuid.uuid4())
    
    jobs_table.put_item(Item={
        'job_id': job_id,
        'status': 'queued',
        'address': request.address
    })
    
    message_body = json.dumps({'job_id': job_id, 'address': request.address})
    sqs.send_message(QueueUrl=QUEUE_URL, MessageBody=message_body)
    
    return {"job_id": job_id, "status": "queued"}

@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    response = jobs_table.get_item(Key={'job_id': job_id})
    if 'Item' not in response:
        return {"status": "NOT_FOUND"}
    
    return response['Item']

handler = Mangum(app)