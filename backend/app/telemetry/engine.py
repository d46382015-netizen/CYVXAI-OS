import time

def telemetry():

    return {
        "timestamp": int(time.time()),
        "events_ingested": 120000,
        "stream_health": "healthy",
        "replication": "active"
    }
