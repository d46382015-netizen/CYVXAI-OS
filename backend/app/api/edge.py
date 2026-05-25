from fastapi import APIRouter
from backend.app.edge.routing import route

router = APIRouter()

@router.get("/edge/route")
def edge(region: str):

    return route(region)
