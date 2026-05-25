def autoscale(cpu, users):

    if cpu > 0.8 or users > 10000:
        return {
            "action": "scale_up",
            "nodes": 2
        }

    if cpu < 0.3:
        return {
            "action": "scale_down",
            "nodes": -1
        }

    return {
        "action": "stable"
    }
