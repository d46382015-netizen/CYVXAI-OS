from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"status": "CYVXAI-OS LIVE"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/scan")
def scan():
    return {
        "status": "working",
        "message": "backend deployed successfully"
    }
