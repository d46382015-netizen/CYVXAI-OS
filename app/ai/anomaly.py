import statistics

history = []

def record(value: float):
    history.append(value)
    if len(history) > 50:
        history.pop(0)

def detect():
    if len(history) < 5:
        return "insufficient_data"

    avg = statistics.mean(history)
    deviation = statistics.pstdev(history)

    latest = history[-1]

    if deviation > 0 and abs(latest - avg) > 2 * deviation:
        return {
            "anomaly": True,
            "severity": "high"
        }

    return {"anomaly": False}
