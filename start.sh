#!/bin/bash

echo "Starting LeakOS Enterprise Event System..."

python -m app.workers.worker &
uvicorn app.main:app --reload --port 8000
