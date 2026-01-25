import boto3
import os
import uuid
import json
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()
sqs = boto3.client('sqs')
dynamodb = boto3.resource('dynamodb')

QUEUE_URL = os.environ.get('JOBS_QUEUE_URL')
TABLE_NAME = os.environ.get('JOBS_TABLE')
table = dynamodb.Table(TABLE_NAME)

class GenerateRequest(BaseModel):
    address: str

@app.post("/api/generate")
async def start_job(request: GenerateRequest):
    job_id = str(uuid.uuid4())
    
    table.put_item(Item={
        'job_id': job_id,
        'status': 'queued',
        'address': request.address
    })
    
    message_body = json.dumps({'job_id': job_id, 'address': request.address})
    sqs.send_message(QueueUrl=QUEUE_URL, MessageBody=message_body)
    
    return {"job_id": job_id, "status": "queued"}

@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    response = table.get_item(Key={'job_id': job_id})
    if 'Item' not in response:
        return {"status": "NOT_FOUND"}
    
    return response['Item']