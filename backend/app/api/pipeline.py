from fastapi import APIRouter
from backend.app.pipeline.engine import create_pipeline

router = APIRouter()

@router.post("/pipeline/create")
def pipeline(name: str):

    return create_pipeline(name)
