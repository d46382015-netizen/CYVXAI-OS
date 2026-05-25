from fastapi import APIRouter, Depends
from backend.app.core.security import get_user

router = APIRouter()

@router.get("/dashboard")
def dashboard(user=Depends(get_user)):
    return {
        "user": user,
        "stats": {
            "scans_today": 12,
            "risk_score": 0.34,
            "ai_recommendation": "optimize_usage"
        }
    }
