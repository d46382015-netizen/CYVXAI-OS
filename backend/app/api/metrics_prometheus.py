from fastapi import APIRouter
from prometheus_client import generate_latest
from fastapi.responses import Response

router = APIRouter()

@router.get("/metrics")
def metrics():

    return Response(
        generate_latest(),
        media_type="text/plain"
    )
