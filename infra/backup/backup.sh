#!/bin/bash

mkdir -p backups

tar -czf backups/cyvxai_backup.tar.gz \
backend \
frontend \
infra \
docker-compose.yml \
.env

echo "Backup complete"
