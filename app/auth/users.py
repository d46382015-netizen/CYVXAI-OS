import uuid

USERS = {}

def create_user(email, password, tenant_id):
    uid = str(uuid.uuid4())

    USERS[uid] = {
        "user_id": uid,
        "email": email,
        "password": password,
        "tenant_id": tenant_id,
        "plan": "free"
    }

    return USERS[uid]

def get_user(email):
    for u in USERS.values():
        if u["email"] == email:
            return u
    return None
