from fastapi import APIRouter
from backend.app.storage.object import put

router = APIRouter()

@router.post("/object")
def object_store(name: str):

    return put(name)
