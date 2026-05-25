from fastapi import APIRouter

router = APIRouter()

@router.post("/create-checkout")
def checkout():
    return {
        "url": "https://checkout.stripe.com/pay/live_session"
    }
