QUEUE = []

def enqueue(task):

    QUEUE.append(task)

    return {
        "queued": True,
        "size": len(QUEUE)
    }
