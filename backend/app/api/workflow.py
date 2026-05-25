from fastapi import APIRouter
from backend.app.workflow.engine import create_workflow

router = APIRouter()

@router.post("/workflow/create")
def workflow(name: str, steps: int):

    return create_workflow(name, steps)
