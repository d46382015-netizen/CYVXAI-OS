from sqlalchemy import Column, String
from backend.app.db.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True)
    password = Column(String)
    role = Column(String, default="user")
    stripe_customer_id = Column(String, nullable=True)
    plan = Column(String, default="free")
