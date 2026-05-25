import os

STRIPE_SECRET = os.getenv("STRIPE_SECRET", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8000")
