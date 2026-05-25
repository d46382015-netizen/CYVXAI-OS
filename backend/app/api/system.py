from fastapi import APIRouter
import platform
import time

router = APIRouter()

BOOT = time.time()

@router.get("/system/status")
def status():

    return {
        "platform": platform.system(),
        "uptime_seconds": int(time.time() - BOOT),
        "mode": "enterprise",
        "cluster": "active"
    }
