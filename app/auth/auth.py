from jose import jwt
from passlib.context import CryptContext
import os
import uuid

SECRET = os.getenv("JWT_SECRET", "dev_secret")
ALGO = "HS256"

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(p):
    return pwd.hash(p)

def verify_password(p, h):
    return pwd.verify(p, h)

def create_token(user_id):
    return jwt.encode({"sub": user_id}, SECRET, algorithm=ALGO)

def decode_token(token):
    return jwt.decode(token, SECRET, algorithms=[ALGO])
