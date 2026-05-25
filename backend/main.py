from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.auth import router as auth_router
from backend.app.api.dashboard import router as dashboard_router
from backend.app.api.ai import router as ai_router
from backend.app.api.system import router as system_router

app = FastAPI(
    title="CYVXAI Enterprise SaaS OS"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(ai_router)
app.include_router(system_router)

@app.get("/")
def root():
    return {
        "status": "CYVXAI ENTERPRISE ACTIVE"
    }
