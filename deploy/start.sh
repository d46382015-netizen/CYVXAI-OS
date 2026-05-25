#!/bin/bash
echo "Starting LeakOS Production Stack"

source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
