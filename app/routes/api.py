from fastapi import APIRouter, UploadFile, File, Header, HTTPException
from app.core.engine import scan_csv_safe

router = APIRouter()

fake_users = {}
scans = {}

@router.post("/scan")
async def scan(file: UploadFile = File(...), authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(401, "No token")

    content = await file.read()
    result = scan_csv_safe(content)

    scans.setdefault(authorization, []).append(result)

    return result


@router.get("/history")
def history(authorization: str = Header(None)):
    return scans.get(authorization, [])


@router.post("/billing/checkout")
def checkout():
    return {"url": "https://checkout.stripe.com/pay/demo"}
