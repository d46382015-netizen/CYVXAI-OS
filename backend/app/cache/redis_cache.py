import redis

r = redis.Redis(
    host="redis",
    port=6379,
    decode_responses=True
)

def cache_set(key, value):
    r.set(key, value)

def cache_get(key):
    return r.get(key)
