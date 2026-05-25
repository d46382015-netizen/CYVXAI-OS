from fastapi import APIRouter
from backend.app.federation.engine import join

router = APIRouter()

@router.post("/federation/join")
def federation(node: str):

    return join(node)
