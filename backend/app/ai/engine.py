def analyze_risk(score: float):

    if score > 0.8:
        return {
            "risk": "critical",
            "action": "throttle"
        }

    if score > 0.5:
        return {
            "risk": "medium",
            "action": "monitor"
        }

    return {
        "risk": "low",
        "action": "normal"
    }
