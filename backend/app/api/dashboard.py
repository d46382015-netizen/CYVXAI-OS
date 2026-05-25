from fastapi import APIRouter
import random

router = APIRouter()

@router.get("/dashboard")
def dashboard():

    return {
        "system_health": "healthy",
        "active_users": random.randint(50, 500),
        "requests_today": random.randint(1000, 15000),
        "ai_status": "online",
        "revenue_mode": "active"
    }
