from fastapi import APIRouter
from backend.app.optimizer.engine import optimize

router = APIRouter()

@router.get("/optimizer")
def optimizer(cpu: float, memory: float):

    return optimize(cpu, memory)
