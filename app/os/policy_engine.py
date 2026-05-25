from app.os.event_bus import subscribe, emit

POLICIES = {
    "HIGH_LOAD": "scale_down_throttle",
    "HIGH_ERROR": "enter_safe_mode",
    "FREE_USER_LIMIT": "trigger_upsell",
    "ANOMALY": "lockdown_user"
}

def evaluate(event):
    etype = event["type"]

    if etype == "load_high":
        emit("policy_action", {"action": POLICIES["HIGH_LOAD"]})

    if etype == "error_spike":
        emit("policy_action", {"action": POLICIES["HIGH_ERROR"]})

    if etype == "usage_limit_free":
        emit("policy_action", {"action": POLICIES["FREE_USER_LIMIT"]})

def register():
    subscribe("load_high", evaluate)
    subscribe("error_spike", evaluate)
    subscribe("usage_limit_free", evaluate)
