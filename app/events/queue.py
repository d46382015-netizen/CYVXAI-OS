import redis
import json
import time

r = redis.Redis(host="localhost", port=6379, decode_responses=True)

STREAM = "leakos_events"

def emit(event_type, payload):
    event = {
        "type": event_type,
        "payload": json.dumps(payload),
        "ts": time.time()
    }
    r.xadd(STREAM, event)
    return event

def read_events(last_id="0-0"):
    return r.xread({STREAM: last_id}, count=10, block=1000)
