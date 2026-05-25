from fastapi import APIRouter
from backend.app.marketplace.engine import publish

router = APIRouter()

@router.post("/marketplace/publish")
def marketplace(name: str):

    return publish(name)
