from app.events.bus import drain

def process():
    results = []

    for event in drain():
        if event["type"] == "SCAN_CREATED":
            rows = event["payload"]["rows"]
            total = sum(r["amount"] for r in rows)

            results.append({
                "scan_id": event["payload"]["scan_id"],
                "total_waste": total,
                "severity": "high" if total > 2000 else "low"
            })

    return results
