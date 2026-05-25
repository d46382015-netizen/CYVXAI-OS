#!/bin/bash

echo "Booting FULL LeakOS Production System"

# start backend
bash deploy/start.sh &

# start frontend
cd frontend && python3 -m http.server 3000
