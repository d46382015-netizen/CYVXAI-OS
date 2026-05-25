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
from backend.app.api.platform import router as platform_router
from backend.app.api.metrics import router as metrics_router
from backend.app.api.autoscale import router as autoscale_router
from backend.app.api.compliance import router as compliance_router
from backend.app.api.search import router as search_router
from backend.app.api.storage import router as storage_router
from backend.app.api.recommendation import router as recommendation_router
from backend.app.api.pipeline import router as pipeline_router
from backend.app.api.webhooks import router as webhooks_router
from backend.app.api.edge import router as edge_router
from backend.app.api.vector import router as vector_router
from backend.app.api.workflow import router as workflow_router
from backend.app.api.knowledge import router as knowledge_router
from backend.app.api.governance import router as governance_router
from backend.app.api.forecasting import router as forecasting_router
from backend.app.api.simulation import router as simulation_router
from backend.app.api.marketplace import router as marketplace_router
from backend.app.api.identity import router as identity_router
from backend.app.api.recovery import router as recovery_router
from backend.app.api.optimizer import router as optimizer_router
from backend.app.api.federation import router as federation_router
from backend.app.api.telemetry import router as telemetry_router
from backend.app.realtime.ws import router as realtime_router

app = FastAPI(
    title="CYVXAI Global Autonomous Enterprise OS"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

routers = [
    auth_router,
    dashboard_router,
    ai_router,
    system_router,
    analytics_router,
    security_router,
    notifications_router,
    audit_router,
    autonomous_router,
    platform_router,
    metrics_router,
    autoscale_router,
    compliance_router,
    search_router,
    storage_router,
    recommendation_router,
    pipeline_router,
    webhooks_router,
    edge_router,
    vector_router,
    workflow_router,
    knowledge_router,
    governance_router,
    forecasting_router,
    simulation_router,
    marketplace_router,
    identity_router,
    recovery_router,
    optimizer_router,
    federation_router,
    telemetry_router,
    realtime_router
]

for r in routers:
    app.include_router(r)

@app.get("/")
def root():

    return {
        "status": "CYVXAI GLOBAL OPERATING SYSTEM ACTIVE",
        "federation": "enabled",
        "marketplace": "online",
        "telemetry": "streaming",
        "vector_memory": True,
        "governance": "enterprise"
    }
