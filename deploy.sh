#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/opt/testbuild"

if [ ! -d "$REPO_DIR" ]; then
  echo "\u26A0\uFE0F  Directory $REPO_DIR does not exist."
  echo "   Create it first:"
  echo "   mkdir -p $REPO_DIR"
  echo "   Then copy docker-compose.prod.yml and .env into it."
  exit 1
fi

cd "$REPO_DIR"

echo "1\u20E3  Pulling latest images..."
docker compose -f docker-compose.prod.yml pull

echo "2\u20E3  Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo "3\u20E3  Done! Check status:"
docker compose -f docker-compose.prod.yml ps

