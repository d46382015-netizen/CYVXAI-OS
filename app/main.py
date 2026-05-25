from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.os.bootstrap import boot
from app.routes.api import router as api_router
from app.routes.system import router as system_router
from app.routes.ai import router as ai_router

app = FastAPI(title="CYVXAI-OS Autonomous SaaS OS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

boot()

app.include_router(api_router)
app.include_router(system_router)
app.include_router(ai_router)

@app.get("/")
def root():
    return {"status": "AUTONOMOUS SAAS OS ACTIVE"}
