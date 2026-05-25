NODES = []

def join(node):

    NODES.append(node)

    return {
        "joined": True,
        "cluster_size": len(NODES)
    }
