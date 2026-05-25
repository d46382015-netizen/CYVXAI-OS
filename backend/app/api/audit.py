from fastapi import APIRouter
from backend.app.audit.logger import log

router = APIRouter()

@router.post("/audit")
def audit(action: str, user: str):

    return log(action, user)
