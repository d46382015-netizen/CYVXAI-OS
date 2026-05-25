def route(region):

    return {
        "region": region,
        "edge_node": f"{region}-01",
        "cache": True
    }
