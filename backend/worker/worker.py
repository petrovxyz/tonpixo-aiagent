import json
import os
import boto3
import pandas as pd
import awswrangler as wr
from get_trans import fetch_transactions, fetch_jettons, fetch_nfts

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
                df = fetch_transactions(address, api_key=TONAPI_KEY, on_progress=on_progress)
            
            # Final cancellation check before saving
            if check_job_cancelled(job_id):
                print(f"Job {job_id} cancelled before saving results")
                continue
            
            # Save to Parquet with Partitioning
            path = f"s3://{BUCKET_NAME}/data/{scan_type}/"
            
            # Ensure datetime columns are properly formatted for Parquet/Athena
            if 'datetime' in df.columns:
                df['datetime'] = pd.to_datetime(df['datetime'])
            
            # Add job_id column for partitioning key (although wr.s3.to_parquet handles it, 
            # often good to have it in the dataframe before partition_cols extracts it 
            # or simply to be explicit)
            df['job_id'] = job_id
            
            wr.s3.to_parquet(
                df=df,
                path=path,
                dataset=True,
                mode='append',
                partition_cols=['job_id'],
                database=None, # We'll manage database via template or manually, creating table on the fly is also possible but we have explicit table in template
                table=None
            )
            
            final_count = len(df)
            final_status = 'empty' if final_count == 0 else 'success'
            
            # We no longer have a single file download URL in the same way, 
            # but we can point to the S3 path or just say success.
            # The agent will query via SQL.
            
            table.update_item(
                Key={'job_id': job_id},
                UpdateExpression="set #s = :s, #c = :c",
                ExpressionAttributeNames={'#s': 'status', '#c': 'count'},
                ExpressionAttributeValues={':s': final_status, ':c': final_count}
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