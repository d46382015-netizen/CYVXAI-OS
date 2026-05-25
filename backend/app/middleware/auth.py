from fastapi import Request
from fastapi.responses import JSONResponse
from jose import jwt
from backend.app.core.config import settings

async def auth_middleware(request: Request, call_next):

    public_paths = [
        "/",
        "/docs",
        "/openapi.json"
    ]

    if request.url.path in public_paths:
        return await call_next(request)

    token = request.headers.get("Authorization")

    if not token:
        return JSONResponse(
            {"error":"missing_token"},
            status_code=401
        )

    try:

        token = token.replace("Bearer ", "")

        jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"]
        )

    except:
        return JSONResponse(
            {"error":"invalid_token"},
            status_code=401
        )

    return await call_next(request)
