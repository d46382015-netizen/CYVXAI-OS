from dotenv import load_dotenv
import os

load_dotenv()

class Settings:

    APP_NAME = os.getenv(
        "APP_NAME",
        "CYVXAI"
    )

    JWT_SECRET = os.getenv(
        "JWT_SECRET",
        "change_this"
    )

    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "sqlite:///./cyvxai.db"
    )

    REDIS_URL = os.getenv(
        "REDIS_URL",
        "redis://redis:6379"
    )

settings = Settings()
