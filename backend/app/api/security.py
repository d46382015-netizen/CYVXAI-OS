from fastapi import APIRouter
from backend.app.security.threat_engine import detect

router = APIRouter()

@router.get("/security/check")
def security(ip: str, score: float):

    return detect(ip, score)
