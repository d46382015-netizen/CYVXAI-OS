import time

METRICS = {
    "requests": 0,
    "errors": 0,
    "last_reset": time.time()
}

def inc_request():
    METRICS["requests"] += 1

def inc_error():
    METRICS["errors"] += 1

def get_metrics():
    return METRICS
