from app.os.event_bus import subscribe, emit

USAGE = {}

LIMITS = {
    "free": 10,
    "pro": 100
}

USER_PLAN = {}

def enforce(event):
    user = event["payload"].get("user")
    if not user:
        return

    USAGE[user] = USAGE.get(user, 0) + 1
    plan = USER_PLAN.get(user, "free")

    if USAGE[user] > LIMITS["free"] and plan == "free":
        emit("usage_limit_free", {"user": user})

def register():
    subscribe("request", enforce)
