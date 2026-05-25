from fastapi import APIRouter
from backend.app.autoscale.engine import autoscale

router = APIRouter()

@router.get("/cluster/autoscale")
def scale(cpu: float, users: int):

    return autoscale(cpu, users)
