VECTORS = []

def embed(text):

    vector = {
        "text": text,
        "dimensions": 1536,
        "indexed": True
    }

    VECTORS.append(vector)

    return vector
