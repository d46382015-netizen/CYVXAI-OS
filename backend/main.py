from fastapi import FastAPI

app = FastAPI(title="CYVXAI Production SaaS")

@app.get("/")
def root():
    return {"status": "production_ready"}
