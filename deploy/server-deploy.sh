#!/usr/bin/env bash
set -euo pipefail

if [ ! -f ".env.production" ]; then
  echo "Missing .env.production. Copy .env.production.example and fill secrets first." >&2
  exit 1
fi

docker compose pull db
docker compose up -d --build
docker compose ps

echo "Checking health endpoint..."
health_ok=0
for i in {1..30}; do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
    curl -fsS http://127.0.0.1:3000/api/health
    echo
    health_ok=1
    break
  fi
  sleep 2
done

if [ "$health_ok" -ne 1 ]; then
  echo "Health check failed after 60 seconds." >&2
  docker compose logs --tail=120 app
  exit 1
fi

echo "Deployment complete. App should be reachable on http://SERVER_IP:3000"
