def generate_insights(data):
    return {
        "risk_trend": "stable" if data < 0.5 else "rising",
        "recommendation": (
            "reduce_activity" if data > 0.7 else "maintain"
        ),
        "score": data * 100
    }
