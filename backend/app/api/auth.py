from fastapi import APIRouter
from backend.app.core.auth import create_token

router = APIRouter()

@router.post("/login")
def login(email: str):
    token = create_token(email)

    return {
        "access_token": token,
        "email": email,
        "role": "user",
        "plan": "pro"
    }
