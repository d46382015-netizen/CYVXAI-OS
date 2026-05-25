OBJECTS = []

def put(name):

    OBJECTS.append(name)

    return {
        "stored": True,
        "name": name
    }
