from fastapi import Header, HTTPException
from backend.app.core.auth import jwt, SECRET, ALGO

def get_user(token: str = Header(None)):
    if not token:
        raise HTTPException(401, "missing token")

    try:
        decoded = jwt.decode(token, SECRET, algorithms=[ALGO])
        return decoded["sub"]
    except:
        raise HTTPException(401, "invalid token")
