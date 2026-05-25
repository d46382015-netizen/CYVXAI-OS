from fastapi import FastAPI
from backend.app.api.auth import router as auth_router
from backend.app.api.dashboard import router as dash_router
from backend.app.api.ai import router as ai_router

app = FastAPI(title="CYVXAI SaaS Platform")

app.include_router(auth_router)
app.include_router(dash_router)
app.include_router(ai_router)

@app.get("/")
def root():
    return {"status": "SaaS + AI layer active"}
