import time

STATE = {
    "load": 0.3,
    "error_rate": 0.0,
    "revenue_pressure": 0.5
}

def update_state(load=None, error_rate=None):
    if load is not None:
        STATE["load"] = load
    if error_rate is not None:
        STATE["error_rate"] = error_rate

def decide():
    # Core autonomous decision logic
    if STATE["error_rate"] > 0.2:
        return "reduce_complexity_mode"

    if STATE["load"] > 0.8:
        return "throttle_requests_mode"

    if STATE["revenue_pressure"] > 0.7:
        return "upsell_mode"

    return "normal_mode"
