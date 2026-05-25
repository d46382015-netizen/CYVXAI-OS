#!/bin/bash

docker compose down

docker compose up --build -d

echo "CYVXAI production cluster online"
