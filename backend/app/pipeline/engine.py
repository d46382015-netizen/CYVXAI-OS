PIPELINES = []

def create_pipeline(name):

    pipeline = {
        "name": name,
        "status": "active"
    }

    PIPELINES.append(pipeline)

    return pipeline
