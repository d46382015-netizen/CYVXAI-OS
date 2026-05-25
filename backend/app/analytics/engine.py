def growth_projection(users, revenue):

    growth_score = (users * 0.4) + (revenue * 0.6)

    if growth_score > 10000:
        status = "hypergrowth"
    elif growth_score > 3000:
        status = "accelerating"
    else:
        status = "steady"

    return {
        "growth_score": growth_score,
        "trajectory": status
    }
