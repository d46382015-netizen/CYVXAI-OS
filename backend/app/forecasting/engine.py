def forecast(users, growth):

    projected = users * (1 + growth)

    return {
        "projected_users": int(projected),
        "growth_rate": growth
    }
