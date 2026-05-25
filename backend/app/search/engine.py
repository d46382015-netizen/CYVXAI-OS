DATA = [
    "analytics",
    "security",
    "billing",
    "cluster",
    "ai engine",
    "dashboard"
]

def search(q):

    return [
        item for item in DATA
        if q.lower() in item.lower()
    ]
