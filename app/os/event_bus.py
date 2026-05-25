import redis
import json
import time

r = redis.Redis(host="localhost", port=6379, decode_responses=True)

CHANNEL = "cyvx-events"

def emit(event_type, payload):
    event = {
        "type": event_type,
        "payload": payload,
        "ts": time.time()
    }
    r.publish(CHANNEL, json.dumps(event))

def subscribe(handler):
    pubsub = r.pubsub()
    pubsub.subscribe(CHANNEL)

    for msg in pubsub.listen():
        if msg["type"] == "message":
            handler(json.loads(msg["data"]))
