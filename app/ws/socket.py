clients = []

async def connect(ws):
    await ws.accept()
    clients.append(ws)

async def broadcast(msg):
    dead = []

    for c in clients:
        try:
            await c.send_json(msg)
        except:
            dead.append(c)

    for d in dead:
        clients.remove(d)
