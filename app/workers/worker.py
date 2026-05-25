import json
import time
from app.events.queue import read_events
from app.db import save_event

def process(event):
    payload = json.loads(event[1][0][1]["payload"])
    event_type = event[1][0][1]["type"]

    if event_type == "SCAN_CREATED":
        rows = json.loads(payload["rows"])
        total = sum(r["amount"] for r in rows)

        result = {
            "total_waste": total,
            "severity": "high" if total > 2000 else "low"
        }

        save_event("SCAN_PROCESSED", result)

while True:
    events = read_events()

    if events:
        for event in events:
            process(event)

    time.sleep(1)
