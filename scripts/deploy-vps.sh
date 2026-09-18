#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "ERROR: /opt/brewstead/.env is missing."
  echo "Create it from .env.example before deploying."
  exit 1
fi

if ! docker network inspect web >/dev/null 2>&1; then
  echo "ERROR: Docker network 'web' does not exist."
  echo "Brewstead expects the external Traefik network already used on the VPS."
  exit 1
fi

echo "Building Brewstead..."
docker compose build --pull

echo "Starting Brewstead..."
docker compose up -d --remove-orphans

echo
docker compose ps

echo
echo "Deployment completed."
