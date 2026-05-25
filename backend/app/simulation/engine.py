def simulate(load, nodes):

    return {
        "predicted_latency_ms": int((load * 100) / nodes),
        "predicted_cost": nodes * 120
    }
