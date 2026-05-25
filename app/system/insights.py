from collections import defaultdict

DATA = defaultdict(float)

def record_scan(result):
    DATA["total_waste"] += result.get("total_waste", 0)
    DATA["scans"] += 1

def get_insight():
    if DATA["scans"] == 0:
        return {"status": "waiting_for_data"}

    return {
        "avg_waste": DATA["total_waste"] / DATA["scans"],
        "scans": DATA["scans"],
        "status": "learning"
    }
