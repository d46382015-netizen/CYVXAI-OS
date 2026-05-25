from fastapi import APIRouter
from backend.app.compliance.engine import compliance_report

router = APIRouter()

@router.get("/compliance/report")
def report():
    return compliance_report()
