import time
import redis

r = redis.Redis(host="redis", port=6379)

while True:
    job = r.rpop("scans")

    if job:
        print("Processed:", job.decode())

    time.sleep(1)
