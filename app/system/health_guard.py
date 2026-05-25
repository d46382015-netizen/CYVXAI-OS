import time

STATE = {
    "last_error": None,
    "failures": 0,
    "status": "healthy"
}

def report_error(error: str):
    STATE["last_error"] = error
    STATE["failures"] += 1

    if STATE["failures"] > 3:
        STATE["status"] = "degraded"

def reset_health():
    STATE["failures"] = 0
    STATE["status"] = "healthy"

def get_health():
    return STATE
