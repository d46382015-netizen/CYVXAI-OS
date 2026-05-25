from dotenv import load_dotenv
import os

load_dotenv()

class Settings:
    APP_NAME = "CYVXAI Enterprise SaaS"
    JWT_SECRET = os.getenv("JWT_SECRET", "cyvxai_local_secret")
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "sqlite:///./cyvxai.db"
    )
    REDIS_URL = os.getenv(
        "REDIS_URL",
        "redis://localhost:6379"
    )

settings = Settings()
