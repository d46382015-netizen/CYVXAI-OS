from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.auth import router as auth_router
from backend.app.api.dashboard import router as dashboard_router
from backend.app.api.ai import router as ai_router
from backend.app.api.system import router as system_router
from backend.app.api.analytics import router as analytics_router
from backend.app.api.security import router as security_router
from backend.app.api.notifications import router as notifications_router
from backend.app.api.audit import router as audit_router
from backend.app.api.autonomous import router as autonomous_router
from backend.app.realtime.ws import router as realtime_router

app = FastAPI(
    title="CYVXAI HyperScale SaaS OS"
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
app.include_router(analytics_router)
app.include_router(security_router)
app.include_router(notifications_router)
app.include_router(audit_router)
app.include_router(autonomous_router)
app.include_router(realtime_router)

@app.get("/")
def root():

    return {
        "status": "CYVXAI HYPERSCALE ACTIVE",
        "cluster_mode": "distributed",
        "autonomous": True
    }
