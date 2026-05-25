FILES = []

def upload(name):

    FILES.append(name)

    return {
        "uploaded": True,
        "file": name
    }
