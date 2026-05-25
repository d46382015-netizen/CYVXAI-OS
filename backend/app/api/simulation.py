from fastapi import APIRouter
from backend.app.simulation.engine import simulate

router = APIRouter()

@router.get("/simulate")
def simulation(load: float, nodes: int):

    return simulate(load, nodes)
