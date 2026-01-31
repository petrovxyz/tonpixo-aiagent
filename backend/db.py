
import os
import boto3
import uuid
from datetime import datetime
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')

CHATS_TABLE_NAME = os.environ.get('CHATS_TABLE')
MESSAGES_TABLE_NAME = os.environ.get('MESSAGES_TABLE')

def get_chats_table():
    return dynamodb.Table(CHATS_TABLE_NAME)

def get_messages_table():
    return dynamodb.Table(MESSAGES_TABLE_NAME)

def save_chat(user_id: int, chat_id: str, title: str = "New Chat", job_id: str = None, address: str = None):
    """
    Creates or updates a chat session.
    """
    if not CHATS_TABLE_NAME:
        print("CHATS_TABLE is not set")
        return None

    try:
        table = get_chats_table()
        timestamp = datetime.utcnow().isoformat()
        
        item = {
            'chat_id': chat_id,
            'user_id': str(user_id),
            'title': title,
            'updated_at': timestamp,
            'created_at': timestamp # This might need logic to not overwrite created_at on update
        }
        
        if job_id:
            item['job_id'] = job_id
        if address:
            item['address'] = address
            
        # Use update_item to only set created_at if not exists? 
        # For simplicity, let's assume save_chat is called on creation. 
        # Use put_item with condition attribute_not_exists(chat_id) for creation?
        # Let's just use put_item for now, maybe handling updates differently.
        
        # If we want to upsert and keep created_at:
        update_expr = "SET user_id = :u, title = :t, updated_at = :up, created_at = if_not_exists(created_at, :up)"
        expr_values = {
            ':u': str(user_id),
            ':t': title,
            ':up': timestamp
        }
        
        if job_id:
            update_expr += ", job_id = :j"
            expr_values[':j'] = job_id
        if address:
            update_expr += ", address = :a"
            expr_values[':a'] = address

        table.update_item(
             Key={'chat_id': chat_id},
             UpdateExpression=update_expr,
             ExpressionAttributeValues=expr_values
        )
        print(f"Chat {chat_id} saved for user {user_id} with title='{title[:30]}...' at {timestamp}")
        return chat_id
    except ClientError as e:
        print(f"Error saving chat: {e}")
        return None

def save_message(chat_id: str, role: str, content: str, trace_id: str = None):
    """
    Saves a message to the MessagesTable.
    """
    if not MESSAGES_TABLE_NAME:
        print("MESSAGES_TABLE is not set")
        return None

    try:
        table = get_messages_table()
        timestamp = datetime.utcnow().isoformat()
        message_id = str(uuid.uuid4())
        
        item = {
            'chat_id': chat_id,
            'created_at': timestamp,
            'message_id': message_id,
            'role': role,
            'content': content,
        }
        if trace_id:
            item['trace_id'] = trace_id
            
        table.put_item(Item=item)
        print(f"Message saved to chat {chat_id}")
        return message_id
    except ClientError as e:
        print(f"Error saving message: {e}")
        return None

def get_user_chats(user_id: int, limit: int = 20, last_key: dict = None):
    """
    Retrieves chats for a specific user, sorted by recently updated.
    Supports pagination via last_key.
    
    Note: Due to DynamoDB GSI eventual consistency, when updated_at changes,
    the old index entry may briefly coexist with the new one. We deduplicate
    by chat_id to prevent showing duplicate entries.
    """
    if not CHATS_TABLE_NAME:
        return [], None

    try:
        table = get_chats_table()
        # Fetch more than the limit to account for potential duplicates
        fetch_limit = limit * 2
        query_params = {
            'IndexName': 'UserChatsIndex',
            'KeyConditionExpression': Key('user_id').eq(str(user_id)),
            'ScanIndexForward': False, # Descending order (newest first)
            'Limit': fetch_limit
        }
        
        if last_key:
            query_params['ExclusiveStartKey'] = last_key
            
        response = table.query(**query_params)
        items = response.get('Items', [])
        next_key = response.get('LastEvaluatedKey')
        
        # Debug: Log raw items before deduplication
        raw_chat_ids = [(item.get('chat_id'), item.get('updated_at')) for item in items]
        print(f"[DB] Raw query returned {len(items)} items for user {user_id}: {raw_chat_ids}")
        
        # Deduplicate by chat_id, keeping the first occurrence (most recent updated_at)
        # since results are sorted by updated_at descending
        seen_chat_ids = set()
        deduplicated_items = []
        duplicates_found = 0
        for item in items:
            chat_id = item.get('chat_id')
            if chat_id and chat_id not in seen_chat_ids:
                seen_chat_ids.add(chat_id)
                deduplicated_items.append(item)
                if len(deduplicated_items) >= limit:
                    break
            elif chat_id in seen_chat_ids:
                duplicates_found += 1
                print(f"[DB] Filtered duplicate chat_id: {chat_id}, updated_at: {item.get('updated_at')}")
        
        if duplicates_found > 0:
            print(f"[DB] Removed {duplicates_found} duplicate chat entries")
        
        print(f"[DB] Returning {len(deduplicated_items)} deduplicated items")
        return deduplicated_items, next_key
    except ClientError as e:
        print(f"Error fetching chats for user {user_id}: {e}")
        return [], None

def get_user_chats_count(user_id: int):
    """
    Gets the total count of chats for a user.
    """
    if not CHATS_TABLE_NAME:
        return 0

    try:
        table = get_chats_table()
        response = table.query(
            IndexName='UserChatsIndex',
            KeyConditionExpression=Key('user_id').eq(str(user_id)),
            Select='COUNT'
        )
        return response.get('Count', 0)
    except ClientError as e:
        print(f"Error counting chats for user {user_id}: {e}")
        return 0

def get_chat_messages(chat_id: str):
    """
    Retrieves all messages for a specific chat.
    """
    if not MESSAGES_TABLE_NAME:
        return []

    try:
        table = get_messages_table()
        response = table.query(
            KeyConditionExpression=Key('chat_id').eq(chat_id),
            ScanIndexForward=True # Ascending order (oldest first)
        )
        return response.get('Items', [])
    except ClientError as e:
        print(f"Error fetching messages for chat {chat_id}: {e}")
        return []

def get_last_message(chat_id: str):
    """
    Retrieves the last (most recent) message for a specific chat.
    """
    if not MESSAGES_TABLE_NAME:
        return None

    try:
        table = get_messages_table()
        response = table.query(
            KeyConditionExpression=Key('chat_id').eq(chat_id),
            ScanIndexForward=False,  # Descending order (newest first)
            Limit=1
        )
        items = response.get('Items', [])
        return items[0] if items else None
    except ClientError as e:
        print(f"Error fetching last message for chat {chat_id}: {e}")
        return None

def get_chat(chat_id: str):
    """
    Get chat metadata.
    """
    if not CHATS_TABLE_NAME:
        return None
        
    try:
        table = get_chats_table()
        response = table.get_item(Key={'chat_id': chat_id})
        return response.get('Item')
    except ClientError as e:
        print(f"Error fetching chat {chat_id}: {e}")
        return None
