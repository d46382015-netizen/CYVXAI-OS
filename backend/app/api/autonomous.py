from fastapi import APIRouter
from backend.app.agents.autonomous import autonomous_decision

router = APIRouter()

@router.get("/autonomous/decision")
def autonomous(load: float, threats: float):

    return autonomous_decision(load, threats)
