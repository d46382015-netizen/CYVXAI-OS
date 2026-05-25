from fastapi import APIRouter
from backend.app.ai.engine import analyze_risk

router = APIRouter()

@router.get("/ai/analyze")
def analyze(score: float):
    return analyze_risk(score)

@router.get("/ai/predict")
def predict(load: float):

    return {
        "prediction":
            "scale_up"
            if load > 0.75
            else "stable",

        "confidence": 0.94
    }
