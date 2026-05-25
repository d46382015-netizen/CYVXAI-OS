from fastapi import FastAPI
from app.os.event_bus import subscribe

app = FastAPI(title="Realtime Dashboard")

events = []

def handler(event):
    events.append(event)
    if len(events) > 100:
        events.pop(0)

subscribe(handler)

@app.get("/stream")
def stream():
    return {"events": events}
