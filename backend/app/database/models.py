from sqlalchemy import Column, Integer, String, Boolean
from backend.app.database.db import Base

class User(Base):

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    email = Column(String, unique=True)

    hashed_password = Column(String)

    role = Column(String, default="user")

    active = Column(Boolean, default=True)
