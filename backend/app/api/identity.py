from fastapi import APIRouter
from backend.app.identity.engine import create_identity

router = APIRouter()

@router.post("/identity/create")
def identity(user: str):

    return create_identity(user)
