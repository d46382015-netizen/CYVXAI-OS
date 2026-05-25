from fastapi import APIRouter
from backend.app.queue.engine import enqueue

router = APIRouter()

@router.post("/queue")
def queue(task: str):

    return enqueue(task)
