from fastapi import APIRouter
from backend.app.disaster.recovery import recover

router = APIRouter()

@router.post("/recovery/failover")
def recovery(region: str):

    return recover(region)
