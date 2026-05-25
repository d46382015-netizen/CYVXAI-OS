import hashlib, uuid

USERS = {}

def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def create_user(email, password):
    user_id = str(uuid.uuid4())
    USERS[email] = {
        "id": user_id,
        "email": email,
        "password": hash_password(password)
    }
    return USERS[email]

def login(email, password):
    user = USERS.get(email)
    if not user:
        return None
    if user["password"] != hash_password(password):
        return None
    return user
