from fastapi import Header, HTTPException
import uuid

def create_user(email: str, password: str):
    from app.db.database import USERS
    if email in USERS:
        raise HTTPException(400, "User exists")
    USERS[email] = {"password": password, "id": str(uuid.uuid4()), "plan": "free"}
    return USERS[email]

def login_user(email: str, password: str):
    from app.db.database import USERS, SESSIONS
    user = USERS.get(email)
    if not user or user["password"] != password:
        raise HTTPException(401, "Invalid login")
    token = str(uuid.uuid4())
    SESSIONS[token] = user["id"]
    return token

def get_user(x_token: str = Header(None)):
    from app.db.database import SESSIONS
    if not x_token or x_token not in SESSIONS:
        raise HTTPException(401, "Invalid session")
    return SESSIONS[x_token]
