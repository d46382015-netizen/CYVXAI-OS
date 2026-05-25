from jose import jwt
from passlib.context import CryptContext
import os, datetime

SECRET = os.getenv("JWT_SECRET", "dev")
ALGO = "HS256"

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(p): return pwd.hash(p)

def verify(p, h): return pwd.verify(p, h)

def create_token(user_id, role="user"):
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }
    return jwt.encode(payload, SECRET, algorithm=ALGO)
