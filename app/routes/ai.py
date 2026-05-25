from fastapi import APIRouter
from app.ai.decision_engine import decide, update_state
from app.ai.anomaly import detect, record
from app.ai.revenue import optimize
from app.ai.autotune import tune

router = APIRouter()

@router.get("/ai/decision")
def decision(load: float = 0.5, error_rate: float = 0.0):
    update_state(load, error_rate)
    return {"decision": decide()}

@router.get("/ai/anomaly")
def anomaly(value: float):
    record(value)
    return detect()

@router.get("/ai/revenue")
def revenue(usage: int, plan: str):
    return optimize(usage, plan)

@router.get("/ai/autotune")
def autotune(load: float):
    return tune(load)
