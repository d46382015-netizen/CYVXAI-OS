def recommend(activity):

    if activity > 80:
        return {
            "tier": "enterprise",
            "reason": "high_usage_detected"
        }

    if activity > 30:
        return {
            "tier": "pro"
        }

    return {
        "tier": "starter"
    }
