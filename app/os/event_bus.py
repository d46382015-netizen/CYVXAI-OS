from collections import defaultdict
import time

EVENTS = []

SUBSCRIBERS = defaultdict(list)

def emit(event_type: str, payload: dict):
    event = {
        "type": event_type,
        "payload": payload,
        "ts": time.time()
    }
    EVENTS.append(event)

    for fn in SUBSCRIBERS[event_type]:
        fn(event)

def subscribe(event_type: str, fn):
    SUBSCRIBERS[event_type].append(fn)

def get_events():
    return EVENTS[-100:]
