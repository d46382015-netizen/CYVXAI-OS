from fastapi import APIRouter
from app.system.health_guard import get_health
from app.system.metrics import get_metrics
from app.system.insights import get_insight

router = APIRouter()

@router.get("/system/health")
def health():
    return get_health()

@router.get("/system/metrics")
def metrics():
    return get_metrics()

@router.get("/system/insights")
def insights():
    return get_insight()
