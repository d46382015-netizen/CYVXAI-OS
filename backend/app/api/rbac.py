from fastapi import APIRouter
from backend.app.rbac.roles import has_permission

router = APIRouter()

@router.get("/rbac/check")
def check(role: str, permission: str):

    return {
        "allowed": has_permission(role, permission)
    }
