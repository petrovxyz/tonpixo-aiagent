import json
import os
import boto3
import pandas as pd
from get_trans import fetch_history

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

TABLE_NAME = os.environ.get('JOBS_TABLE')
BUCKET_NAME = os.environ.get('DATA_BUCKET')
TONAPI_KEY = os.environ.get('TONAPI_KEY')
table = dynamodb.Table(TABLE_NAME)

def lambda_handler(event, context):
    for record in event['Records']:
        body = json.loads(record['body'])
        job_id = body['job_id']
        address = body['address']
        
        print(f"Processing job {job_id} for {address}")
        
        # Define progress callback
        def on_progress(count):
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
                UpdateExpression="set #s = :s, #c = :c",
                ExpressionAttributeNames={'#s': 'status', '#c': 'count'},
                ExpressionAttributeValues={':s': 'processing', ':c': 0}
            )
            
            df = fetch_history(address, api_key=TONAPI_KEY, on_progress=on_progress)
            
            file_key = f"exports/{job_id}.csv"
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
            
        except Exception as e:
            print(f"Error: {e}")
            table.update_item(
                Key={'job_id': job_id},
                UpdateExpression="set #s = :s, error_msg = :e",
                ExpressionAttributeNames={'#s': 'status'},
                ExpressionAttributeValues={':s': 'error', ':e': str(e)}
            )

    return {"status": "success"}