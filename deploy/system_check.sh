#!/bin/bash

echo "=== LeakOS Health Check ==="

echo "[1] Backend health:"
curl -s http://127.0.0.1:8000/health || echo "Backend not running"

echo "[2] API docs:"
curl -s http://127.0.0.1:8000/docs | head -n 5

echo "[3] Frontend check:"
curl -s http://127.0.0.1:3000 | head -n 5

echo "==========================="
