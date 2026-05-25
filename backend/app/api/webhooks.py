from fastapi import APIRouter
from backend.app.webhooks.engine import register

router = APIRouter()

@router.post("/webhooks/register")
def webhook(url: str):

    return register(url)
