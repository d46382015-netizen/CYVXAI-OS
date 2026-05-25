CONFIG = {
    "max_threads": 4,
    "cache_enabled": True,
    "mode": "balanced"
}

def tune(load):
    if load > 0.8:
        CONFIG["mode"] = "performance"
        CONFIG["cache_enabled"] = True

    elif load < 0.3:
        CONFIG["mode"] = "cost_saving"
        CONFIG["max_threads"] = 2

    else:
        CONFIG["mode"] = "balanced"

    return CONFIG
