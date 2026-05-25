from fastapi import FastAPI
from redis import Redis
import uuid

app = FastAPI()

redis = Redis(host="redis", port=6379)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/scan")
def scan(rows: list):

    scan_id = str(uuid.uuid4())
    total = sum(r["amount"] for r in rows)

    redis.lpush("scans", str({
        "scan_id": scan_id,
        "total": total
    }))

    return {"scan_id": scan_id, "status": "queued"}
