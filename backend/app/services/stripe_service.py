import stripe, os

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

def create_checkout(customer_email, price_id):
    return stripe.checkout.Session.create(
        mode="subscription",
        payment_method_types=["card"],
        customer_email=customer_email,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url="https://yourapp.com/success",
        cancel_url="https://yourapp.com/cancel"
    )
