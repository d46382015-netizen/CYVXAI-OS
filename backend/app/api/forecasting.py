from fastapi import APIRouter
from backend.app.forecasting.engine import forecast

router = APIRouter()

@router.get("/forecast")
def forecasting(users: int, growth: float):

    return forecast(users, growth)
