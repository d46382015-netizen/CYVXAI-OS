from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.middleware.auth import auth_middleware
from backend.app.health.routes import router as health_router

app = FastAPI(
    title="CYVXAI Production Platform"
)

app.middleware("http")(auth_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(health_router)

@app.get("/")
def root():

    return {
        "status": "CYVXAI PRODUCTION ACTIVE"
    }
