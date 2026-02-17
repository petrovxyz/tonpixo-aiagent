
import os
import boto3
import uuid
from typing import Optional
from datetime import datetime
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeSerializer

dynamodb = boto3.resource('dynamodb')

CHATS_TABLE_NAME = os.environ.get('CHATS_TABLE')
MESSAGES_TABLE_NAME = os.environ.get('MESSAGES_TABLE')
IDEMPOTENCY_GUARD_PREFIX = "__idempotency_guard__#"
_TYPE_SERIALIZER = TypeSerializer()


def _serialize_item_for_transact(item: dict) -> dict:
    """
    DynamoDB transact_write_items on the low-level client requires typed values.
    """
    return {key: _TYPE_SERIALIZER.serialize(value) for key, value in item.items()}


def _build_idempotency_guard_sort_key(idempotency_key: str) -> str:
    return f"{IDEMPOTENCY_GUARD_PREFIX}{idempotency_key}"


def _is_idempotency_guard_item(item: dict) -> bool:
    created_at = item.get('created_at')
    if isinstance(created_at, str) and created_at.startswith(IDEMPOTENCY_GUARD_PREFIX):
        return True
    return item.get('item_type') == 'idempotency_guard'


def _get_idempotency_guard_item(chat_id: str, idempotency_key: str):
    if not MESSAGES_TABLE_NAME:
        return None
    try:
        table = get_messages_table()
        response = table.get_item(
            Key={
                'chat_id': chat_id,
                'created_at': _build_idempotency_guard_sort_key(idempotency_key)
            },
            ConsistentRead=True
        )
        return response.get('Item')
    except ClientError as e:
        print(f"Error fetching idempotency guard for chat {chat_id}: {e}")
        return None

def get_chats_table():
    return dynamodb.Table(CHATS_TABLE_NAME)

def get_messages_table():
    return dynamodb.Table(MESSAGES_TABLE_NAME)

def save_chat(user_id: int, chat_id: str, title: str = "New Chat", job_id: Optional[str] = None, address: Optional[str] = None):
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

def save_message(chat_id: str, role: str, content: str, trace_id: Optional[str] = None, idempotency_key: Optional[str] = None):
    """
    Saves a message to the MessagesTable.
    """
    if not MESSAGES_TABLE_NAME:
        print("MESSAGES_TABLE is not set")
        return None

    table = get_messages_table()
    timestamp = datetime.utcnow().isoformat()
    message_id = str(uuid.uuid4())

    message_item = {
        'chat_id': chat_id,
        'created_at': timestamp,
        'message_id': message_id,
        'role': role,
        'content': content,
    }
    if trace_id:
        message_item['trace_id'] = trace_id
    if idempotency_key:
        message_item['idempotency_key'] = idempotency_key

    try:
        if not idempotency_key:
            table.put_item(Item=message_item)
            print(f"Message saved to chat {chat_id}")
            return message_id

        guard_item = {
            'chat_id': chat_id,
            'created_at': _build_idempotency_guard_sort_key(idempotency_key),
            'item_type': 'idempotency_guard',
            'idempotency_key': idempotency_key,
            'message_id': message_id,
            'message_created_at': timestamp,
        }

        dynamodb.meta.client.transact_write_items(
            TransactItems=[
                {
                    'Put': {
                        'TableName': MESSAGES_TABLE_NAME,
                        'Item': _serialize_item_for_transact(guard_item),
                        'ConditionExpression': 'attribute_not_exists(chat_id) AND attribute_not_exists(created_at)',
                    }
                },
                {
                    'Put': {
                        'TableName': MESSAGES_TABLE_NAME,
                        'Item': _serialize_item_for_transact(message_item),
                        'ConditionExpression': 'attribute_not_exists(chat_id) AND attribute_not_exists(created_at)',
                    }
                }
            ]
        )
        print(f"Message saved to chat {chat_id} with idempotency_key {idempotency_key}")
        return message_id
    except ClientError as e:
        error_details = e.response.get('Error', {})
        error_code = error_details.get('Code')
        if idempotency_key and error_code == 'TransactionCanceledException':
            existing_guard = _get_idempotency_guard_item(chat_id, idempotency_key)
            if existing_guard and existing_guard.get('message_id'):
                existing_message_id = existing_guard['message_id']
                print(f"Message with idempotency_key {idempotency_key} already exists in chat {chat_id}")
                return existing_message_id
            cancellation_reasons = e.response.get('CancellationReasons')
            print(
                f"Transaction canceled while saving message in chat {chat_id} "
                f"with idempotency_key {idempotency_key}. "
                f"ErrorDetails: {error_details}. "
                f"CancellationReasons: {cancellation_reasons}"
            )
        print(f"Error saving message: {e}. ErrorDetails: {error_details}")
        return None

def get_user_chats(user_id: int, limit: int = 20, last_key: Optional[dict] = None):
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

        # Deduplicate by chat_id, keeping the first occurrence (most recent updated_at)
        # since results are sorted by updated_at descending.
        seen_chat_ids = set()
        deduplicated_items = []
        duplicates_found = 0
        next_key = last_key
        page = 0

        while True:
            response = table.query(**query_params)
            items = response.get('Items', [])
            next_key = response.get('LastEvaluatedKey')
            page += 1

            # Debug: Log raw items before deduplication
            raw_chat_ids = [(item.get('chat_id'), item.get('updated_at')) for item in items]
            print(f"[DB] Raw query page {page} returned {len(items)} items for user {user_id}: {raw_chat_ids}")

            for item in items:
                chat_id = item.get('chat_id')
                if chat_id and chat_id not in seen_chat_ids:
                    seen_chat_ids.add(chat_id)
                    deduplicated_items.append(item)
                elif chat_id in seen_chat_ids:
                    duplicates_found += 1
                    print(f"[DB] Filtered duplicate chat_id: {chat_id}, updated_at: {item.get('updated_at')}")

            if len(deduplicated_items) >= limit or not next_key:
                break

            query_params['ExclusiveStartKey'] = next_key
        
        if duplicates_found > 0:
            print(f"[DB] Removed {duplicates_found} duplicate chat entries")
        
        result_items = deduplicated_items[:limit]
        has_more_results = len(deduplicated_items) > limit or bool(next_key)
        if has_more_results and result_items:
            last_item = result_items[-1]
            chat_id = last_item.get('chat_id')
            updated_at = last_item.get('updated_at')
            item_user_id = last_item.get('user_id')
            if chat_id and updated_at and item_user_id:
                next_key = {
                    'chat_id': chat_id,
                    'user_id': item_user_id,
                    'updated_at': updated_at,
                }
                query_params['ExclusiveStartKey'] = next_key
            else:
                print(f"[DB] Could not build pagination key from last deduplicated item: {last_item}")
        elif not has_more_results:
            next_key = None

        print(f"[DB] Returning {len(result_items)} deduplicated items")
        return result_items, next_key
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
        query_params = {
            'KeyConditionExpression': Key('chat_id').eq(chat_id),
            'ScanIndexForward': True # Ascending order (oldest first)
        }
        items = []
        while True:
            response = table.query(**query_params)
            items.extend(response.get('Items', []))
            last_key = response.get('LastEvaluatedKey')
            if not last_key:
                break
            query_params['ExclusiveStartKey'] = last_key
        return [item for item in items if not _is_idempotency_guard_item(item)]
    except ClientError as e:
        print(f"Error fetching messages for chat {chat_id}: {e}")
        return []

def get_last_message(chat_id: str):
    """
    Retrieves the last (most recent) message for a specific chat.
    """
    recent_messages = get_recent_chat_messages(chat_id, limit=1)
    return recent_messages[0] if recent_messages else None

def get_recent_chat_messages(chat_id: str, limit: int = 20):
    """
    Retrieves the last `limit` messages for a specific chat.
    Returns them in chronological order (oldest first).
    """
    if not MESSAGES_TABLE_NAME:
        return []

    try:
        table = get_messages_table()
        query_params = {
            'KeyConditionExpression': Key('chat_id').eq(chat_id),
            'ScanIndexForward': False,  # Descending order, newest first
            'Limit': max(limit * 2, 20),
        }
        collected_items = []
        while len(collected_items) < limit:
            response = table.query(**query_params)
            for item in response.get('Items', []):
                if _is_idempotency_guard_item(item):
                    continue
                collected_items.append(item)
                if len(collected_items) >= limit:
                    break

            last_key = response.get('LastEvaluatedKey')
            if not last_key:
                break
            query_params['ExclusiveStartKey'] = last_key

        # Reverse to return chronological order (oldest first)
        return collected_items[::-1]
    except ClientError as e:
        print(f"Error fetching recent messages for chat {chat_id}: {e}")
        return []

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

# ========== FAVOURITES ==========

FAVOURITES_TABLE_NAME = os.environ.get('FAVOURITES_TABLE')

def get_favourites_table():
    return dynamodb.Table(FAVOURITES_TABLE_NAME)

def save_favourite(user_id: int, address: str, name: Optional[str] = None):
    """
    Add an address to user's favourites.
    """
    if not FAVOURITES_TABLE_NAME:
        print("FAVOURITES_TABLE is not set")
        return None

    try:
        table = get_favourites_table()
        timestamp = datetime.utcnow().isoformat()
        
        item = {
            'user_id': str(user_id),
            'address': address,
            'created_at': timestamp,
        }
        if name:
            item['name'] = name
            
        table.put_item(Item=item)
        print(f"Favourite {address} saved for user {user_id}")
        return address
    except ClientError as e:
        print(f"Error saving favourite: {e}")
        return None

def remove_favourite(user_id: int, address: str):
    """
    Remove an address from user's favourites.
    """
    if not FAVOURITES_TABLE_NAME:
        print("FAVOURITES_TABLE is not set")
        return False

    try:
        table = get_favourites_table()
        table.delete_item(Key={'user_id': str(user_id), 'address': address})
        print(f"Favourite {address} removed for user {user_id}")
        return True
    except ClientError as e:
        print(f"Error removing favourite: {e}")
        return False

def get_user_favourites(user_id: int, limit: int = 50):
    """
    Get all favourites for a user.
    """
    if not FAVOURITES_TABLE_NAME:
        return []

    try:
        table = get_favourites_table()
        response = table.query(
            KeyConditionExpression=Key('user_id').eq(str(user_id)),
            Limit=limit
        )
        return response.get('Items', [])
    except ClientError as e:
        print(f"Error fetching favourites for user {user_id}: {e}")
        return []

def is_favourite(user_id: int, address: str):
    """
    Check if an address is in user's favourites.
    """
    if not FAVOURITES_TABLE_NAME:
        return False

    try:
        table = get_favourites_table()
        response = table.get_item(Key={'user_id': str(user_id), 'address': address})
        return 'Item' in response
    except ClientError as e:
        print(f"Error checking favourite: {e}")
        return False
