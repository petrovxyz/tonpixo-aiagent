import json
import os
import boto3
import pandas as pd
from get_trans import fetch_history, fetch_jettons, fetch_nfts

from utils import get_config_value

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

TABLE_NAME = os.environ.get('JOBS_TABLE')
BUCKET_NAME = os.environ.get('DATA_BUCKET')
TONAPI_KEY = get_config_value('TONAPI_KEY')
table = dynamodb.Table(TABLE_NAME)

# Exception to signal job cancellation
class JobCancelledException(Exception):
    pass

def check_job_cancelled(job_id):
    """Check if job has been cancelled."""
    try:
        response = table.get_item(Key={'job_id': job_id})
        if 'Item' in response:
            return response['Item'].get('status') == 'cancelled'
    except Exception as e:
        print(f"Error checking cancellation status: {e}")
    return False

def lambda_handler(event, context):
    for record in event['Records']:
        body = json.loads(record['body'])
        job_id = body['job_id']
        address = body['address']
        scan_type = body.get('scan_type', 'transactions')
        
        print(f"Processing job {job_id} for {address}, scan_type: {scan_type}")
        
        # Check if already cancelled before starting
        if check_job_cancelled(job_id):
            print(f"Job {job_id} was cancelled before processing started")
            continue
        
        # Define progress callback with cancellation check
        def on_progress(count):
            # Check for cancellation
            if check_job_cancelled(job_id):
                print(f"Job {job_id} cancelled during processing")
                raise JobCancelledException(f"Job {job_id} was cancelled")
            
            try:
                table.update_item(
                    Key={'job_id': job_id},
                    UpdateExpression="set #s = :s, #c = :c",
                    ExpressionAttributeNames={'#s': 'status', '#c': 'count'},
                    ExpressionAttributeValues={':s': 'processing', ':c': count}
                )
            except Exception as e:
                print(f"Error updating progress: {e}")

        try:
            # Initial status update
            table.update_item(
                Key={'job_id': job_id},
                UpdateExpression="set #s = :s, #c = :c, scan_type = :t",
                ExpressionAttributeNames={'#s': 'status', '#c': 'count'},
                ExpressionAttributeValues={':s': 'processing', ':c': 0, ':t': scan_type}
            )
            
            # Fetch data based on scan type
            if scan_type == 'jettons':
                df = fetch_jettons(address, api_key=TONAPI_KEY, on_progress=on_progress)
            elif scan_type == 'nfts':
                df = fetch_nfts(address, api_key=TONAPI_KEY, on_progress=on_progress)
            else:  # Default to transactions
                df = fetch_history(address, api_key=TONAPI_KEY, on_progress=on_progress)
            
            # Final cancellation check before saving
            if check_job_cancelled(job_id):
                print(f"Job {job_id} cancelled before saving results")
                continue
            
            file_key = f"exports/{job_id}_{scan_type}.csv"
            csv_buffer = df.to_csv(index=False)
            
            s3.put_object(Bucket=BUCKET_NAME, Key=file_key, Body=csv_buffer)
            
            download_url = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': BUCKET_NAME, 'Key': file_key},
                ExpiresIn=3600
            )
            
            final_count = len(df)
            final_status = 'empty' if final_count == 0 else 'success'
            
            table.update_item(
                Key={'job_id': job_id},
                UpdateExpression="set #s = :s, download_url = :u, #c = :c",
                ExpressionAttributeNames={'#s': 'status', '#c': 'count'},
                ExpressionAttributeValues={':s': final_status, ':u': download_url, ':c': final_count}
            )
        
        except JobCancelledException:
            print(f"Job {job_id} processing stopped due to cancellation")
            # Status already set to cancelled, no need to update
            
        except Exception as e:
            print(f"Error: {e}")
            # Only update to error if not cancelled
            if not check_job_cancelled(job_id):
                table.update_item(
                    Key={'job_id': job_id},
                    UpdateExpression="set #s = :s, error_msg = :e",
                    ExpressionAttributeNames={'#s': 'status'},
                    ExpressionAttributeValues={':s': 'error', ':e': str(e)}
                )

    return {"status": "success"}