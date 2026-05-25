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

cd ../frontend

npm install

nohup npm run dev -- --host 0.0.0.0 \
> ../logs/frontend.log 2>&1 &

echo "CYVXAI FULL STACK ACTIVE"
