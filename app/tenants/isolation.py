import uuid

def create_tenant(name):
    return {
        "tenant_id": str(uuid.uuid4()),
        "name": name
    }

def tenant_scope(data, tenant_id):
    return [d for d in data if d.get("tenant_id") == tenant_id]
