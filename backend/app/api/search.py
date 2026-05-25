from fastapi import APIRouter
from backend.app.search.engine import search

router = APIRouter()

@router.get("/search")
def query(q: str):

    return {
        "results": search(q)
    }
