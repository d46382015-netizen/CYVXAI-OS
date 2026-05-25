from fastapi import APIRouter
from backend.app.tokens.refresh import create_refresh

router = APIRouter()

@router.post("/tokens/refresh")
def refresh(user: str):

    return {
        "refresh_token": create_refresh(user)
    }
