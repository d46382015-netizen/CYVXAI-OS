from app.os.event_bus import subscribe

def handle(event):
    print("WORKER RECEIVED:", event["type"])

    if event["type"] == "request":
        # simulate processing
        pass

    if event["type"] == "error":
        # alert system
        pass

if __name__ == "__main__":
    subscribe(handle)
