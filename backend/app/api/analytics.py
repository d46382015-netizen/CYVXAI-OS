from fastapi import APIRouter
from backend.app.analytics.engine import growth_projection

router = APIRouter()

@router.get("/analytics/growth")
def analytics(users: int, revenue: int):

    return growth_projection(users, revenue)
