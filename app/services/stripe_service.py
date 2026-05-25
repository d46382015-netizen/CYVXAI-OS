import stripe
import os

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

def create_checkout(customer_email: str):
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        mode="subscription",
        line_items=[{
            "price": os.getenv("STRIPE_PRICE_ID", "price_placeholder"),
            "quantity": 1
        }],
        success_url="https://example.com/success",
        cancel_url="https://example.com/cancel",
        customer_email=customer_email
    )
    return session.url
