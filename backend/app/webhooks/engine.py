HOOKS = []

def register(url):

    HOOKS.append(url)

    return {
        "registered": True,
        "url": url
    }
