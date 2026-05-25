import hashlib
import hmac
import base64
import json
import time
import uuid

SECRET = "LEAKOS_SUPER_SECRET_CHANGE_ME"

def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def verify_password(pw, hashed):
    return hash_password(pw) == hashed

def create_token(payload):
    payload["exp"] = time.time() + 3600
    raw = json.dumps(payload).encode()
    sig = hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return base64.b64encode(raw).decode() + "." + sig

def decode_token(token):
    try:
        raw_b64, sig = token.split(".")
        raw = base64.b64decode(raw_b64.encode())

        expected = hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()
        if expected != sig:
            return None

        data = json.loads(raw)

        if data["exp"] < time.time():
            return None

        return data
    except:
        return None
