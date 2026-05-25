from app.os.event_bus import subscribe, emit

STATE = {
    "errors": 0,
    "mode": "healthy"
}

def handle(event):
    if event["type"] == "error":
        STATE["errors"] += 1

    if STATE["errors"] > 5:
        STATE["mode"] = "degraded"
        emit("system_mode", {"mode": "degraded"})

def register():
    subscribe("error", handle)
