from fastapi import FastAPI
from app.os.event_bus import emit

app = FastAPI(title="CYVXAI API Gateway")

@app.post("/event")
def event(event_type: str, user: str):
    emit(event_type, {"user": user})
    return {"status": "queued"}

@app.get("/health")
def health():
    return {"status": "gateway_online"}
