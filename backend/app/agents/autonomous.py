def autonomous_decision(load, threats):

    if threats > 0.8:
        return {
            "mode": "lockdown",
            "action": "restrict_requests"
        }

    if load > 0.75:
        return {
            "mode": "scale_up",
            "action": "deploy_resources"
        }

    return {
        "mode": "stable",
        "action": "maintain_cluster"
    }
