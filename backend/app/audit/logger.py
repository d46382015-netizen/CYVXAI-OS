import time

LOGS = []

def log(action, user):

    LOGS.append({
        "action": action,
        "user": user,
        "timestamp": int(time.time())
    })

    return LOGS[-1]
