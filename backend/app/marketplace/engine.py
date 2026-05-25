MODULES = []

def publish(name):

    module = {
        "name": name,
        "downloads": 0,
        "verified": True
    }

    MODULES.append(module)

    return module
