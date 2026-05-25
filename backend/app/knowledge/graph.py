GRAPH = {}

def link(a, b):

    if a not in GRAPH:
        GRAPH[a] = []

    GRAPH[a].append(b)

    return {
        "linked": True,
        "source": a,
        "target": b
    }
