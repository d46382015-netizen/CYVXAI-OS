from fastapi import APIRouter
from backend.app.knowledge.graph import link

router = APIRouter()

@router.post("/knowledge/link")
def knowledge(a: str, b: str):

    return link(a, b)
