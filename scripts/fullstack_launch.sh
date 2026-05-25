#!/bin/bash

pkill -f uvicorn || true
pkill -f vite || true

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

nohup npm run dev \
> ../logs/frontend.log 2>&1 &

sleep 8

echo ""
echo "CYVXAI FULLSTACK PLATFORM ONLINE"
echo ""

echo "Frontend:"
echo "http://127.0.0.1:3000"

echo ""

echo "Backend:"
echo "http://127.0.0.1:8000/health"

echo ""
