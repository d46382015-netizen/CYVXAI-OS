from fastapi import APIRouter, HTTPException
from backend.app.core.auth import hash_password, verify, create_token

router = APIRouter()

# simple in-memory demo store (replace with Postgres later)
USERS = {}

@router.post("/register")
def register(email: str, password: str):
    if email in USERS:
        raise HTTPException(400, "User exists")

    USERS[email] = hash_password(password)
    return {"status": "created"}

@router.post("/login")
def login(email: str, password: str):
    if email not in USERS:
        raise HTTPException(401, "invalid")

    if not verify(password, USERS[email]):
        raise HTTPException(401, "invalid")

    token = create_token(email)
    return {"access_token": token}
