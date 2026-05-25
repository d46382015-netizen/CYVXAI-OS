from fastapi import APIRouter
from backend.app.notifications.engine import notify

router = APIRouter()

@router.post("/notify")
def send(event: str, user: str):

    return notify(event, user)
