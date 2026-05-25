def optimize(user_usage, plan):
    # Simple SaaS intelligence logic

    if plan == "free" and user_usage > 10:
        return {
            "action": "upsell_prompt",
            "message": "You are approaching your free limit. Upgrade for unlimited scans."
        }

    if user_usage > 50:
        return {
            "action": "limit_throttle",
            "message": "Usage limit reached"
        }

    return {
        "action": "no_action"
    }
