from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.health.routes import router as health_router
from backend.app.api.rbac import router as rbac_router
from backend.app.api.tokens import router as tokens_router
from backend.app.api.queue import router as queue_router
from backend.app.api.object import router as object_router
from backend.app.api.metrics_prometheus import router as metrics_router

app = FastAPI(
    title="CYVXAI Global SaaS OS"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

routers = [
    health_router,
    rbac_router,
    tokens_router,
    queue_router,
    object_router,
    metrics_router
]

for r in routers:
    app.include_router(r)

@app.get("/")
def root():

    return {
        "status": "CYVXAI NEXT GEN ACTIVE",
        "distributed": True,
        "observability": True,
        "queue_engine": True
    }
