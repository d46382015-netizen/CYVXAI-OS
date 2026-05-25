#!/bin/bash

echo "Deploying LeakOS to Kubernetes..."

kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/api.yaml
kubectl apply -f k8s/auth.yaml
kubectl apply -f k8s/worker.yaml

echo "DEPLOYMENT COMPLETE"
kubectl get pods
kubectl get svc
