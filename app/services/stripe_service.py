import os

STRIPE_SECRET = os.getenv("STRIPE_SECRET", "")

def create_checkout_session():
    # placeholder safe structure (no fake calls)
    return {
        "checkout_url": "https://stripe.com/checkout/session-placeholder"
    }
