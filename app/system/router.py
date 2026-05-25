import time

def route_request(load):
    if load > 0.8:
        return "fast_path"
    elif load > 0.5:
        return "balanced_path"
    return "normal_path"
