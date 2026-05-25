import base64, json, time

SECRET = "leakos_secret"

def encode(payload):
    payload["exp"] = time.time() + 3600
    raw = json.dumps(payload).encode()
    return base64.b64encode(raw).decode()

def decode(token):
    try:
        data = json.loads(base64.b64decode(token.encode()))
        if data["exp"] < time.time():
            return None
        return data
    except:
        return None
