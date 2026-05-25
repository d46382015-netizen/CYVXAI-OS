from fastapi import APIRouter, WebSocket
import asyncio
import random
import time

router = APIRouter()

clients = []

@router.websocket("/ws/live")
async def websocket_endpoint(ws: WebSocket):

    await ws.accept()
    clients.append(ws)

    try:

        while True:

            payload = {
                "timestamp": int(time.time()),
                "cpu_load": round(random.uniform(0.1, 0.95), 2),
                "active_users": random.randint(100, 5000),
                "revenue": random.randint(500, 25000),
                "threat_score": round(random.uniform(0.0, 1.0), 2)
            }

            await ws.send_json(payload)

            await asyncio.sleep(2)

    except:
        clients.remove(ws)
