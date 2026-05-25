from fastapi import APIRouter, UploadFile, File
from app.core.engine import scan_csv_safe

router = APIRouter()

@router.post("/scan_csv")
async def scan_csv(file: UploadFile = File(...)):
    content = await file.read()
    return scan_csv_safe(content)
