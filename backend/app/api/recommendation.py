from fastapi import APIRouter
from backend.app.ml.recommendation import recommend

router = APIRouter()

@router.get("/ml/recommend")
def recommendation(activity: int):

    return recommend(activity)
