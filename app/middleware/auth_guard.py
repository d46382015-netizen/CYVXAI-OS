from app.auth.jwt import decode

def require_user(token):
    user = decode(token)
    if not user:
        raise Exception("Unauthorized")
    return user
