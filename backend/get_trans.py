import requests
import pandas as pd
import time
import base64

import json
import os
from dotenv import load_dotenv

load_dotenv()

# Configuration
LABELS_FILE = "labels/labels.json"
API_KEY = os.getenv("TONAPI_KEY", "")


def crc16_xmodem(data: bytes) -> int:
    """Calculate CRC16-XMODEM checksum for TON address encoding."""
    crc = 0
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ 0x1021
            else:
                crc <<= 1
            crc &= 0xFFFF
    return crc


def raw_to_friendly(raw_address: str, bounceable: bool = True, url_safe: bool = True) -> str:
    """
    Convert raw TON address (0:abc123...) to user-friendly format (UQ.../EQ...).
    
    Args:
        raw_address: Raw address in format "workchain:hex_hash"
        bounceable: If True, generates bounceable address (UQ), otherwise non-bounceable (EQ)
        url_safe: If True, uses URL-safe base64 encoding
    
    Returns:
        User-friendly address string
    """
    if not raw_address or ':' not in raw_address:
        return raw_address  # Return as-is if not a valid raw address
    
    try:
        parts = raw_address.split(':')
        if len(parts) != 2:
            return raw_address
        
        workchain = int(parts[0])
        hash_hex = parts[1]
        
        # Validate hash length (should be 64 hex chars = 32 bytes)
        if len(hash_hex) != 64:
            return raw_address
        
        hash_bytes = bytes.fromhex(hash_hex)
        
        # Build the address bytes:
        # 1 byte: flags (0x11 for bounceable, 0x51 for non-bounceable)
        # 1 byte: workchain (signed, but usually 0 or -1)
        # 32 bytes: hash
        # 2 bytes: CRC16-XMODEM checksum
        
        if bounceable:
            flags = 0x11  # Bounceable
        else:
            flags = 0x51  # Non-bounceable
        
        # Handle workchain as signed byte
        if workchain == -1:
            wc_byte = 0xFF
        else:
            wc_byte = workchain & 0xFF
        
        # Build data for checksum (flags + workchain + hash)
        addr_data = bytes([flags, wc_byte]) + hash_bytes
        
        # Calculate CRC16
        checksum = crc16_xmodem(addr_data)
        checksum_bytes = checksum.to_bytes(2, 'big')
        
        # Full address bytes
        full_addr = addr_data + checksum_bytes
        
        # Base64 encode
        if url_safe:
            encoded = base64.urlsafe_b64encode(full_addr).decode('ascii')
        else:
            encoded = base64.b64encode(full_addr).decode('ascii')
        
        return encoded
    
    except (ValueError, IndexError):
        return raw_address  # Return original if conversion fails


def extract_address_hash(address: str) -> str:
    """
    Extract the 32-byte hex hash from a TON address (raw or friendly).
    Returns lowercase hex string or empty string if failed.
    """
    if not address:
        return ""
    
    try:
        # Raw format: "0:hexdigest"
        if ':' in address:
            parts = address.split(':')
            if len(parts) == 2 and len(parts[1]) == 64:
                return parts[1].lower()
        
        # Friendly format: Base64
        # Need to handle potential padding issues if not perfectly padded
        addr_clean = address.replace('-', '+').replace('_', '/')
        missing_padding = len(addr_clean) % 4
        if missing_padding:
            addr_clean += '=' * (4 - missing_padding)
            
        decoded = base64.b64decode(addr_clean)
        
        # Friendly address structure:
        # 1 byte: flags
        # 1 byte: workchain
        # 32 bytes: hash
        # 2 bytes: crc
        # Total 36 bytes
        if len(decoded) == 36:
            return decoded[2:34].hex().lower()
            
    except Exception:
        pass
        
    return ""  # Could not extract



def format_counterparty(address: str, name: str = None) -> str:
    """
    Format counterparty address: use name if available, otherwise convert raw to friendly.
    """
    if name:
        return name
    
    if not address:
        return "Unknown"
    
    # If it's already a friendly address (starts with UQ, EQ, kQ, etc.), return as-is
    if address.startswith(('UQ', 'EQ', 'kQ', '0Q', 'Ef', 'Uf', 'kf', '0f')):
        return address
    
    # If it's a raw address, convert to friendly
    if ':' in address and len(address) > 60:
        return raw_to_friendly(address)
    
    return address


def load_labels():
    """
    Load labels from JSON file and return a dict keyed by address hash.
    Value: {'label': ..., 'category': ..., 'comment': ...}
    """
    labels_map = {}
    if not os.path.exists(LABELS_FILE):
        print(f"Warning: Labels file {LABELS_FILE} not found.")
        return labels_map
        
    try:
        with open(LABELS_FILE, 'r') as f:
            data = json.load(f)
            
        for project in data:
            meta = project.get('metadata', {})
            label = meta.get('label', '')
            category = meta.get('category', '')
            
            for addr_entry in project.get('addresses', []):
                addr = addr_entry.get('address')
                comment = addr_entry.get('comment', '')
                
                addr_hash = extract_address_hash(addr)
                if addr_hash:
                    labels_map[addr_hash] = {
                        'label': label,
                        'category': category,
                        'comment': comment
                    }
    except Exception as e:
        print(f"Error loading labels: {e}")
        
    return labels_map 

def parse_event(event, my_address, labels_map):
    """
    Parse a single event from the TON API /events endpoint.
    This extracts the asset, amount, counterparty, sender, and receiver.
    """
    results = []
    
    event_id = event.get('event_id', '')
    timestamp = event.get('timestamp', 0)
    is_scam = event.get('is_scam', False)
    
    actions = event.get('actions', [])
    
    for action in actions:
        action_type = action.get('type', '')
        status = action.get('status', '')
        
        # Default values
        tx_type = action_type
        asset = "Unknown"
        decimals = 9
        amount = 0
        counterparty = "Unknown"
        direction = "Unknown"
        comment = ""
        
        # New fields
        sender_addr = "Unknown"
        sender_name = None
        receiver_addr = "Unknown"
        receiver_name = None
        
        # TON Transfer
        if action_type == 'TonTransfer':
            data = action.get('TonTransfer', {})
            
            sender_obj = data.get('sender', {})
            sender_addr = sender_obj.get('address', '')
            sender_name = sender_obj.get('name')
            
            recipient_obj = data.get('recipient', {})
            receiver_addr = recipient_obj.get('address', '')
            receiver_name = recipient_obj.get('name')
            
            amount_raw = int(data.get('amount', 0))
            comment = data.get('comment', '')
            
            asset = "TON"
            decimals = 9
            amount = amount_raw / (10 ** decimals)
            
            tx_type = "TON Transfer"
        
        # Jetton (Token) Transfer
        elif action_type == 'JettonTransfer':
            data = action.get('JettonTransfer', {})
            
            sender_obj = data.get('sender', {})
            sender_addr = sender_obj.get('address', '')
            sender_name = sender_obj.get('name')
            
            recipient_obj = data.get('recipient', {})
            receiver_addr = recipient_obj.get('address', '')
            receiver_name = recipient_obj.get('name')
            
            amount_raw = data.get('amount', '0')
            comment = data.get('comment', '')
            
            # Get Jetton metadata
            jetton = data.get('jetton', {})
            asset = jetton.get('symbol', 'Unknown Token')
            decimals = int(jetton.get('decimals', 9))
            
            try:
                amount = int(amount_raw) / (10 ** decimals)
            except (ValueError, TypeError):
                amount = 0
            
            tx_type = "Token Transfer"
        
        # Jetton Mint
        elif action_type == 'JettonMint':
            data = action.get('JettonMint', {})
            
            recipient_obj = data.get('recipient', {})
            receiver_addr = recipient_obj.get('address', '')
            receiver_name = recipient_obj.get('name')
            
            sender_addr = "Null" # Minting usually comes from null or master
            
            amount_raw = data.get('amount', '0')
            jetton = data.get('jetton', {})
            asset = jetton.get('symbol', 'Unknown Token')
            decimals = int(jetton.get('decimals', 9))
            
            try:
                amount = int(amount_raw) / (10 ** decimals)
            except (ValueError, TypeError):
                amount = 0
                
            tx_type = "Token Mint"
        
        # Jetton Burn
        elif action_type == 'JettonBurn':
            data = action.get('JettonBurn', {})
            
            sender_obj = data.get('sender', {})
            sender_addr = sender_obj.get('address', '')
            sender_name = sender_obj.get('name')
            
            receiver_addr = "Null" # Burning goes to null
            
            amount_raw = data.get('amount', '0')
            jetton = data.get('jetton', {})
            asset = jetton.get('symbol', 'Unknown Token')
            decimals = int(jetton.get('decimals', 9))
            
            try:
                amount = int(amount_raw) / (10 ** decimals)
            except (ValueError, TypeError):
                amount = 0
                
            tx_type = "Token Burn"
        
        # NFT Transfer
        elif action_type == 'NftItemTransfer':
            data = action.get('NftItemTransfer', {})
            
            sender_obj = data.get('sender', {})
            sender_addr = sender_obj.get('address', '') if sender_obj else ''
            sender_name = sender_obj.get('name') if sender_obj else None
            
            recipient_obj = data.get('recipient', {})
            receiver_addr = recipient_obj.get('address', '') if recipient_obj else ''
            receiver_name = recipient_obj.get('name') if recipient_obj else None
            
            asset = "NFT"
            amount = 1
            
            tx_type = "NFT Transfer"
        
        # Contract Deploy
        elif action_type == 'ContractDeploy':
            data = action.get('ContractDeploy', {})
            receiver_addr = data.get('address', 'Unknown')
            sender_addr = action.get('sender', {}).get('address', my_address) # Fallback to my_address implies self-action if not specified
            
            asset = "Contract"
            amount = 0
            tx_type = "Contract Deploy"
        
        # Swap
        elif action_type == 'JettonSwap':
            data = action.get('JettonSwap', {})
            
            # For Swap, Sender is Me
            sender_addr = my_address
            
            # Counterparty logic update (Dex)
            receiver_addr = data.get('router', {}).get('address', '') 
            if not receiver_addr:
                 receiver_name = data.get('dex', 'DEX')
                 receiver_addr = receiver_name 
            
            # Determine SENT (Input / User Gave)
            sent_asset = "Unknown"
            sent_amount = 0
            
            jetton_in = data.get('jetton_master_in')
            ton_in = data.get('ton_in')
            amount_in_raw = data.get('amount_in', '0')
            
            if jetton_in:
                sent_asset = jetton_in.get('symbol', 'Token')
                d = int(jetton_in.get('decimals', 9))
                try:
                    sent_amount = int(amount_in_raw) / (10 ** d)
                except:
                    sent_amount = 0
            elif ton_in:
                sent_asset = "TON"
                try:
                    sent_amount = int(ton_in) / (10 ** 9)
                except:
                    sent_amount = 0
            
            # Determine RECEIVED (Output / User Got)
            received_asset = "Unknown"
            received_amount = 0
            
            jetton_out = data.get('jetton_master_out')
            ton_out = data.get('ton_out')
            amount_out_raw = data.get('amount_out', '0')
            
            if jetton_out:
                received_asset = jetton_out.get('symbol', 'Token')
                d = int(jetton_out.get('decimals', 9))
                try:
                    received_amount = int(amount_out_raw) / (10 ** d)
                except:
                    received_amount = 0
            elif ton_out:
                received_asset = "TON"
                try:
                    received_amount = int(ton_out) / (10 ** 9)
                except:
                    received_amount = 0
            
            asset = f"{sent_asset} → {received_asset}"
            amount = received_amount # Show what we got
            direction = "Swap"
            tx_type = "Swap"
        
        # Subscribe
        elif action_type == 'Subscribe':
            data = action.get('Subscribe', {})
            receiver_obj = data.get('beneficiary', {})
            receiver_addr = receiver_obj.get('address', 'Unknown')
            receiver_name = receiver_obj.get('name')
            
            sender_addr = my_address
            
            asset = "Subscription"
            amount = int(data.get('amount', 0)) / (10 ** 9)
            tx_type = "Subscribe"
        
        elif action_type == 'UnSubscribe':
            data = action.get('UnSubscribe', {})
            receiver_obj = data.get('beneficiary', {})
            receiver_addr = receiver_obj.get('address', 'Unknown')
            receiver_name = receiver_obj.get('name')
            
            sender_addr = my_address
            
            asset = "Subscription"
            amount = 0
            tx_type = "Unsubscribe"
        
        # Staking
        elif action_type == 'DepositStake':
            data = action.get('DepositStake', {})
            receiver_obj = data.get('pool', {})
            receiver_addr = receiver_obj.get('address', 'Staking Pool')
            receiver_name = receiver_obj.get('name')
            
            sender_addr = my_address
            
            asset = "TON"
            amount = int(data.get('amount', 0)) / (10 ** 9)
            tx_type = "Stake Deposit"
        
        elif action_type == 'WithdrawStake':
            data = action.get('WithdrawStake', {})
            sender_obj = data.get('pool', {})
            sender_addr = sender_obj.get('address', 'Staking Pool')
            sender_name = sender_obj.get('name')
            
            receiver_addr = my_address
            
            asset = "TON"
            amount = int(data.get('amount', 0)) / (10 ** 9)
            tx_type = "Stake Withdraw"
        
        elif action_type == 'WithdrawStakeRequest':
            data = action.get('WithdrawStakeRequest', {})
            receiver_obj = data.get('pool', {})
            receiver_addr = receiver_obj.get('address', 'Staking Pool')
            receiver_name = receiver_obj.get('name')
            
            sender_addr = my_address
            
            asset = "TON"
            amount = int(data.get('amount', 0)) / (10 ** 9)
            tx_type = "Stake Withdraw Request"
        
        # Auction Bid
        elif action_type == 'AuctionBid':
            data = action.get('AuctionBid', {})
            receiver_obj = data.get('auction', {})
            receiver_addr = receiver_obj.get('address', 'Auction')
            receiver_name = receiver_obj.get('name')
            
            sender_addr = my_address
            
            asset = "TON"
            amount_data = data.get('amount', {})
            amount = int(amount_data.get('value', 0)) / (10 ** 9)
            tx_type = "Auction Bid"
        
        # Smart Contract Exec
        elif action_type == 'SmartContractExec':
            data = action.get('SmartContractExec', {})
            receiver_obj = data.get('contract', {})
            receiver_addr = receiver_obj.get('address', 'Contract')
            receiver_name = receiver_obj.get('name')
            
            sender_addr = my_address
            
            asset = "TON"
            amount = int(data.get('ton_attached', 0)) / (10 ** 9)
            tx_type = "Contract Execution"
        
        # Domain Renew
        elif action_type == 'DomainRenew':
            data = action.get('DomainRenew', {})
            receiver_addr = data.get('domain', 'Unknown Domain')
            sender_addr = my_address
            
            asset = "Domain"
            amount = 0
            tx_type = "Domain Renew"
        
        else:
            # Unknown
            preview = action.get('simple_preview', {})
            if preview:
                tx_type = preview.get('name', action_type)
                asset = preview.get('value', 'Unknown')
                
                # Check for addresses in preview if possible, but hard.
                # Just default to unknown for now.
                
                # Try parsing value
                value_str = preview.get('value', '')
                if value_str:
                    parts = value_str.split()
                    if len(parts) >= 2:
                        try:
                            amount = float(parts[0])
                            asset = parts[1]
                        except ValueError:
                            pass
            else:
                tx_type = action_type

        # Logic to determine direction based on extracted sender/receiver
        
        my_hash = extract_address_hash(my_address)
        sender_hash = extract_address_hash(sender_addr)
        receiver_hash = extract_address_hash(receiver_addr)
        
        if action_type == 'JettonSwap':
            direction = "Swap"
            target_address = receiver_addr # Router
        elif receiver_hash and receiver_hash == my_hash:
            direction = "In"
            target_address = sender_addr
        elif sender_hash and sender_hash == my_hash:
            direction = "Out"
            target_address = receiver_addr
        else:
            # Fallback for special types or failure to match
            target_address = None
            if direction == "Unknown":
                # Some types imply direction
                if action_type in ['Subscribe', 'AuctionBid', 'SmartContractExec', 'DomainRenew', 'ContractDeploy']:
                    direction = "Out"
                    target_address = receiver_addr
                elif action_type in ['JettonMint']:
                    direction = "In"
                    target_address = sender_addr # Null
                elif action_type in ['JettonBurn']:
                    direction = "Out"
                    target_address = receiver_addr # Null
                else:
                    direction = "Internal"
                    # Try to guess target
                    if receiver_addr and receiver_addr != my_address:
                        target_address = receiver_addr
                    elif sender_addr and sender_addr != my_address:
                        target_address = sender_addr

        # Labels lookup
        label = "Unknown"
        category = "Unknown"
        wallet_comment = "Unknown"
        
        target_hash = extract_address_hash(target_address)
        if target_hash and labels_map:
            info = labels_map.get(target_hash)
            if info:
                label = info.get('label') or "Unknown"
                category = info.get('category') or "Unknown"
                wallet_comment = info.get('comment') or "Unknown"

        # Ensure comment is not empty
        final_comment = comment if comment else "Unknown"

        # Format everything
        sender_formatted = format_counterparty(sender_addr, sender_name)
        receiver_formatted = format_counterparty(receiver_addr, receiver_name)

        result = {
            'datetime': pd.to_datetime(timestamp, unit='s'),
            'event_id': event_id,
            'type': tx_type,
            'direction': direction,
            'asset': asset,
            'amount': amount,
            'label': label,
            'category': category,
            'wallet_comment': wallet_comment,
            'sender': sender_formatted,
            'receiver': receiver_formatted,
            'comment': final_comment,
            'status': 'Success' if status == 'ok' else status,
            'is_scam': is_scam
        }
        
        results.append(result)
    
    return results


def fetch_history(account_id, api_key=None, limit_events=None, labels_map=None, on_progress=None):
    """
    Fetch transaction history using the /events endpoint.
    This provides properly parsed actions with real values.
    """
    base_url = f"https://tonapi.io/v2/accounts/{account_id}/events"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    
    all_data = []
    before_lt = None
    is_complete = False
    
    print(f"Fetching events for {account_id}...")
    
    if labels_map is None:
        labels_map = load_labels()
    
    while not is_complete:
        params = {"limit": 100}
        if before_lt:
            params["before_lt"] = before_lt
        
        try:
            resp = requests.get(base_url, headers=headers, params=params)
            
            if resp.status_code == 429:
                print("   Rate limit hit. Pausing...")
                time.sleep(2)
                continue
            
            resp.raise_for_status()
            data = resp.json()
            events = data.get('events', [])
            
            if not events:
                break
            
            limit_reached = False
            
            for event in events:
                # Check limit before processing each event
                if limit_events and len(all_data) >= limit_events:
                    limit_reached = True
                    break
                
                parsed_actions = parse_event(event, account_id, labels_map)
                all_data.extend(parsed_actions)
                
                # Check again after adding actions (an event can have multiple actions)
                if limit_events and len(all_data) >= limit_events:
                    limit_reached = True
                    break
            
            print(f"   Fetched batch of {len(events)} events. Total actions so far: {len(all_data)}")
            
            if on_progress:
                on_progress(len(all_data))
            
            # Check if we've reached the user's limit (break out of main loop)
            if limit_reached:
                print(f"   Reached transaction limit of {limit_events}")
                is_complete = True
            
            # Get next_from for pagination
            next_from = data.get('next_from')
            if next_from:
                before_lt = next_from
            else:
                is_complete = True
            
            if len(events) < 100:
                is_complete = True
            
            time.sleep(0.2)  # Rate limit protection
        
        except requests.exceptions.RequestException as e:
            print(f"Error: {e}")
            break
    
    return pd.DataFrame(all_data)


def fetch_jettons(account_id, api_key=None, on_progress=None):
    """
    Fetch all jetton (token) balances for a wallet.
    Uses GET /v2/accounts/{account_id}/jettons endpoint.
    
    Returns DataFrame with columns:
    - jetton_address: Master contract address of the jetton
    - symbol: Token symbol (e.g., USDT, NOT)
    - name: Full token name
    - balance: Human-readable balance (adjusted for decimals)
    - balance_raw: Raw balance in smallest units
    - decimals: Token decimals
    - price_usd: Current price in USD (if available)
    - value_usd: Total value in USD (balance * price)
    - verified: Whether the token is verified
    - image_url: Token logo URL
    - wallet_address: Jetton wallet address for this account
    """
    base_url = f"https://tonapi.io/v2/accounts/{account_id}/jettons"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    
    all_data = []
    offset = 0
    limit = 100
    
    print(f"Fetching jetton balances for {account_id}...")
    
    while True:
        params = {
            "limit": limit,
            "offset": offset,
            "currencies": "usd"  # Get USD prices
        }
        
        try:
            resp = requests.get(base_url, headers=headers, params=params)
            
            if resp.status_code == 429:
                print("   Rate limit hit. Pausing...")
                time.sleep(2)
                continue
            
            resp.raise_for_status()
            data = resp.json()
            balances = data.get('balances', [])
            
            if not balances:
                break
            
            for item in balances:
                jetton = item.get('jetton', {})
                
                # Get balance with proper decimals
                balance_raw = item.get('balance', '0')
                decimals = int(jetton.get('decimals', 9))
                try:
                    balance = int(balance_raw) / (10 ** decimals)
                except (ValueError, TypeError):
                    balance = 0
                
                # Get price info
                price_info = item.get('price', {})
                price_usd = price_info.get('prices', {}).get('USD', 0) if price_info else 0
                value_usd = balance * price_usd if price_usd else 0
                
                record = {
                    'jetton_address': jetton.get('address', ''),
                    'symbol': jetton.get('symbol', 'Unknown'),
                    'name': jetton.get('name', 'Unknown Token'),
                    'balance': balance,
                    'balance_raw': balance_raw,
                    'decimals': decimals,
                    'price_usd': price_usd,
                    'value_usd': value_usd,
                    'verified': jetton.get('verification') == 'whitelist',
                    'image_url': jetton.get('image', ''),
                    'wallet_address': item.get('wallet_address', {}).get('address', '')
                }
                all_data.append(record)
            
            print(f"   Fetched batch of {len(balances)} jettons. Total: {len(all_data)}")
            
            if on_progress:
                on_progress(len(all_data))
            
            if len(balances) < limit:
                break
            
            offset += limit
            time.sleep(0.2)  # Rate limit protection
            
        except requests.exceptions.RequestException as e:
            print(f"Error fetching jettons: {e}")
            break
    
    return pd.DataFrame(all_data)


def fetch_nfts(account_id, api_key=None, on_progress=None):
    """
    Fetch all NFT items owned by a wallet.
    Uses GET /v2/accounts/{account_id}/nfts endpoint.
    
    Returns DataFrame with columns:
    - nft_address: NFT item address
    - index: Index in collection
    - name: NFT item name
    - description: NFT description
    - collection_address: Collection contract address
    - collection_name: Collection name
    - verified: Whether the collection is verified
    - image_url: NFT image URL (preview)
    - metadata_url: Full metadata URL
    - owner_address: Current owner address
    - sale_price_ton: Sale price if listed (in TON)
    - sale_market: Marketplace if listed
    """
    base_url = f"https://tonapi.io/v2/accounts/{account_id}/nfts"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    
    all_data = []
    offset = 0
    limit = 100
    
    print(f"Fetching NFTs for {account_id}...")
    
    while True:
        params = {
            "limit": limit,
            "offset": offset,
            "indirect_ownership": "false"  # Only directly owned NFTs
        }
        
        try:
            resp = requests.get(base_url, headers=headers, params=params)
            
            if resp.status_code == 429:
                print("   Rate limit hit. Pausing...")
                time.sleep(2)
                continue
            
            resp.raise_for_status()
            data = resp.json()
            nft_items = data.get('nft_items', [])
            
            if not nft_items:
                break
            
            for item in nft_items:
                collection = item.get('collection', {})
                metadata = item.get('metadata', {})
                previews = item.get('previews', [])
                sale = item.get('sale', {})
                
                # Get best preview image
                image_url = ''
                for preview in previews:
                    if preview.get('resolution') == '500x500':
                        image_url = preview.get('url', '')
                        break
                if not image_url and previews:
                    image_url = previews[0].get('url', '')
                
                # Parse sale info
                sale_price_ton = 0
                sale_market = ''
                if sale:
                    price_info = sale.get('price', {})
                    if price_info:
                        try:
                            sale_price_ton = int(price_info.get('value', 0)) / (10 ** 9)
                        except:
                            pass
                    sale_market = sale.get('market', {}).get('name', '')
                
                record = {
                    'nft_address': item.get('address', ''),
                    'index': item.get('index', 0),
                    'name': metadata.get('name', item.get('dns', 'Unknown NFT')),
                    'description': metadata.get('description', '')[:500] if metadata.get('description') else '',
                    'collection_address': collection.get('address', ''),
                    'collection_name': collection.get('name', 'Unknown Collection'),
                    'verified': item.get('verified', False) or collection.get('verified', False),
                    'image_url': image_url or metadata.get('image', ''),
                    'metadata_url': item.get('metadata', {}).get('url', '') if isinstance(item.get('metadata'), dict) else '',
                    'owner_address': item.get('owner', {}).get('address', ''),
                    'sale_price_ton': sale_price_ton,
                    'sale_market': sale_market
                }
                all_data.append(record)
            
            print(f"   Fetched batch of {len(nft_items)} NFTs. Total: {len(all_data)}")
            
            if on_progress:
                on_progress(len(all_data))
            
            if len(nft_items) < limit:
                break
            
            offset += limit
            time.sleep(0.2)  # Rate limit protection
            
        except requests.exceptions.RequestException as e:
            print(f"Error fetching NFTs: {e}")
            break
    
    return pd.DataFrame(all_data)