from fastapi import APIRouter, Request
import stripe, os

router = APIRouter()

@router.post("/stripe/webhook")
async def stripe_webhook(req: Request):
    payload = await req.body()
    sig = req.headers.get("stripe-signature")

    stripe.Webhook.construct_event(
        payload,
        sig,
        os.getenv("STRIPE_WEBHOOK_SECRET")
    )

    return {"status": "received"}
