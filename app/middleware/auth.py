from app.auth.security import decode_token

def require_user(token: str):
    if not token:
        return None
    return decode_token(token)
