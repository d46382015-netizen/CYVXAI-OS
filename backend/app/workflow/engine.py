WORKFLOWS = []

def create_workflow(name, steps):

    workflow = {
        "name": name,
        "steps": steps,
        "status": "active"
    }

    WORKFLOWS.append(workflow)

    return workflow
