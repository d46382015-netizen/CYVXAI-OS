def detect(ip, score):

    if score > 0.85:
        return {
            "blocked": True,
            "reason": "high_risk_activity"
        }

    return {
        "blocked": False,
        "reason": "clean"
    }
