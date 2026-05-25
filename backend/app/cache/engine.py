CACHE = {}

def set_cache(key, value):
    CACHE[key] = value

def get_cache(key):
    return CACHE.get(key)
