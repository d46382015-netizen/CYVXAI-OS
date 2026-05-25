from fastapi import FastAPI
from app.os.event_bus import emit

app = FastAPI(title="Billing Service")

USAGE = {}

@app.post("/track")
def track(user: str):
    USAGE[user] = USAGE.get(user, 0) + 1

    if USAGE[user] > 10:
        emit("billing_limit", {"user": user})

    return {"usage": USAGE[user]}
