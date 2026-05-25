from fastapi import FastAPI
from app.os.event_bus import emit

app = FastAPI(title="AI Core")

@app.get("/decide")
def decide(load: float):
    if load > 0.8:
        emit("scale_down", {"load": load})
        return {"action": "scale_down"}

    return {"action": "normal"}
