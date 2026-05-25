from fastapi import APIRouter
from backend.app.ai.insights import generate_insights

router = APIRouter()

@router.get("/ai/analyze")
def analyze(value: float):
    return generate_insights(value)

@router.get("/ai/simulate")
def simulate(load: float):
    return {
        "prediction": "scale_needed" if load > 0.8 else "stable",
        "confidence": 0.87
    }
