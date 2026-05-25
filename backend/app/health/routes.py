from fastapi import APIRouter
import time

router = APIRouter()

START = time.time()

@router.get("/health")
def health():

    return {
        "status": "healthy",
        "uptime": int(time.time() - START)
    }

@router.get("/ready")
def ready():

    return {
        "ready": True
    }
