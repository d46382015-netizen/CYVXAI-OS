from fastapi import APIRouter
from backend.app.vector.engine import embed

router = APIRouter()

@router.post("/vector/embed")
def vector(text: str):

    return embed(text)
