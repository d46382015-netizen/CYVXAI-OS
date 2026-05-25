import random
import time

def collect():

    return {
        "timestamp": int(time.time()),
        "cpu": round(random.uniform(0.1, 0.95), 2),
        "memory": round(random.uniform(0.2, 0.9), 2),
        "latency_ms": random.randint(5, 120),
        "requests_per_second": random.randint(50, 5000),
        "active_sessions": random.randint(100, 15000)
    }
