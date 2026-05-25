from fastapi import APIRouter
from backend.app.metrics.engine import collect

router = APIRouter()

@router.get("/metrics/live")
def metrics():
    return collect()
