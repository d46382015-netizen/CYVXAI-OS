from app.os.event_bus import emit

def track_request(user: str, load: float):
    emit("request", {"user": user, "load": load})

    if load > 0.8:
        emit("load_high", {"user": user, "load": load})

def track_error(user: str, error: str):
    emit("error", {"user": user, "error": error})

    emit("error_spike", {"user": user})
