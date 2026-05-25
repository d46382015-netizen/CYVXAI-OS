from fastapi import APIRouter
from backend.app.governance.engine import create_policy

router = APIRouter()

@router.post("/governance/policy")
def policy(name: str, severity: str):

    return create_policy(name, severity)
