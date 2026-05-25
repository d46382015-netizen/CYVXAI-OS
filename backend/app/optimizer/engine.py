def optimize(cpu, memory):

    score = (cpu + memory) / 2

    return {
        "optimization_score": score,
        "recommendation":
            "rebalance_cluster"
            if score > 0.75
            else "stable"
    }
