import os

STRIPE_SECRET = os.getenv("STRIPE_SECRET", "sk_test_dummy")

def create_checkout_session(email):
    # REAL VERSION: stripe.checkout.Session.create(...)
    return {
        "checkout_url": "https://stripe.com/test-checkout",
        "email": email
    }

def handle_webhook(event):
    # REAL VERSION: verify signature + event types
    return {"status": "received", "event": event}
