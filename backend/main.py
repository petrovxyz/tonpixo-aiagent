from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import os
import uuid
import threading
from typing import Optional
from get_trans import fetch_history, load_labels
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    address: str
    api_key: Optional[str] = None

# In-memory progress tracking
jobs = {}

# Ensure labels are loaded
labels_map = load_labels()

def run_fetch_task(job_id, address, api_key):
    try:
        def update_progress(count):
            jobs[job_id]["count"] = count

        df = fetch_history(address, api_key, labels_map=labels_map, on_progress=update_progress)
        
        if df.empty:
            jobs[job_id]["status"] = "empty"
            return
        
        filename = f"history_{job_id}.csv"
        filepath = os.path.join("exports", filename)
        os.makedirs("exports", exist_ok=True)
        df.to_csv(filepath, index=False)
        
        jobs[job_id]["status"] = "success"
    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(e)

@app.post("/api/generate")
async def generate_history(request: GenerateRequest):
    job_id = str(uuid.uuid4())
    api_key = request.api_key or os.getenv("TONAPI_KEY")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="API key is required. Provide it in the request or set TONAPI_KEY env var.")

    jobs[job_id] = {"status": "processing", "count": 0}
    
    # Run in background thread
    thread = threading.Thread(target=run_fetch_task, args=(job_id, request.address, api_key))
    thread.start()
    
    return {"job_id": job_id}

@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

@app.get("/api/download/{job_id}")
async def download_history(job_id: str):
    filename = f"history_{job_id}.csv"
    filepath = os.path.join("exports", filename)
    
    if os.path.exists(filepath):
        from fastapi.responses import FileResponse
        return FileResponse(filepath, filename=f"ton_history_{job_id}.csv", media_type='text/csv')
    else:
        raise HTTPException(status_code=404, detail="File not found")
