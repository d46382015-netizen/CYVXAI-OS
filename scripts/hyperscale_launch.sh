#!/bin/bash

pkill -f uvicorn || true

cd backend

python3 -m venv venv

source venv/bin/activate

pip install --upgrade pip

pip install -r requirements.txt

nohup python -m uvicorn main:app \
--host 0.0.0.0 \
--port 8000 \
> ../logs/backend.log 2>&1 &

sleep 5

echo ""
echo "CYVXAI CONTROL PLANE ONLINE"
echo ""

curl http://127.0.0.1:8000/health

echo ""
