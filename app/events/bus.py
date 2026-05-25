from collections import deque
import uuid, time

EVENTS = deque()

def emit(event_type, payload):
    EVENTS.append({
        "id": str(uuid.uuid4()),
        "type": event_type,
        "payload": payload,
        "ts": time.time()
    })

def drain():
    events = list(EVENTS)
    EVENTS.clear()
    return events
