from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.api import router as api_router
from app.routes.system import router as system_router

app = FastAPI(title="CYVXAI-OS Intelligence Core")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(system_router)

@app.get("/")
def root():
    return {"status": "CYVXAI-OS REVOLUTIONARY CORE ACTIVE"}
