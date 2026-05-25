from fastapi import APIRouter, UploadFile, File, Header, HTTPException
from app.core.engine import scan_csv_safe
from app.db.database import SCANS, USERS
import uuid

router = APIRouter()

@router.post("/scan_csv")
async def scan_csv(file: UploadFile = File(...), x_user: str = Header(None)):
    if not x_user:
        raise HTTPException(401, "Missing user")

    content = await file.read()
    result = scan_csv_safe(content)

    SCANS.setdefault(x_user, []).append(result)

    return result


@router.get("/history")
def history(x_user: str = Header(None)):
    return SCANS.get(x_user, [])


@router.post("/auth/register")
def register(email: str, password: str):
    if email in USERS:
        raise HTTPException(400, "Exists")
    USERS[email] = {"password": password, "id": str(uuid.uuid4()), "plan": "free"}
    return USERS[email]


@router.post("/auth/login")
def login(email: str, password: str):
    user = USERS.get(email)
    if not user or user["password"] != password:
        raise HTTPException(401, "Bad login")
    token = str(uuid.uuid4())
    user["token"] = token
    return {"token": token}


@router.post("/billing/checkout")
def checkout():
    return {
        "url": "https://checkout.stripe.com/pay-placeholder"
    }
