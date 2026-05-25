from sqlalchemy import Column, String, Float, Integer, ForeignKey
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    email = Column(String, unique=True)
    password = Column(String)

class Scan(Base):
    __tablename__ = "scans"
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"))
    total_waste = Column(Float)

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(String, primary_key=True)
    user_id = Column(String)
    message = Column(String)
    level = Column(String)
