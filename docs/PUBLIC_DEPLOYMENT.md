# Spark + CYVX Public Deployment

This release turns the repository into one public web service:

- `/` — public Spark product
- `/w/:slug` — generated operational Worlds
- `/os` — CYVX operator interface
- `/api/public/status` — sanitized public platform metrics
- `/healthz` and `/readyz` — deployment health and readiness
- `/api/github/*` — GitHub App control plane

See `render.yaml` and `.github/workflows/deploy-public.yml` for the executable deployment configuration.
