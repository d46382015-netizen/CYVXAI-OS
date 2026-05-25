from fastapi import APIRouter
from backend.app.storage.object_store import upload

router = APIRouter()

@router.post("/storage/upload")
def storage(name: str):

    return upload(name)
