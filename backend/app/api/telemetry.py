from fastapi import APIRouter
from backend.app.telemetry.engine import telemetry

router = APIRouter()

@router.get("/telemetry")
def telem():

    return telemetry()
