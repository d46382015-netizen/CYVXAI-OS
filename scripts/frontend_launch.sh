#!/bin/bash

cd frontend

npm install

nohup npm run dev > ../logs/frontend.log 2>&1 &

sleep 5

echo ""
echo "CYVXAI FRONTEND ONLINE"
echo ""
