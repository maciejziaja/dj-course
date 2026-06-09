#!/usr/bin/env bash
set -euo pipefail

# usage
#./build-and-push.sh wms-api v1
#./build-and-push.sh tms-api

# Konfiguracja
REGISTRY="${REGISTRY:-localhost:5001}"
SERVICE="${1:-wms-api}"             # np. wms-api, tms-api
CONTEXT="../${SERVICE}"             # katalog z Dockerfile
TAG="${2:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"

IMAGE="${REGISTRY}/deliveroo/${SERVICE}"

echo "==> Building ${IMAGE}:${TAG}"
docker build -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" "${CONTEXT}"

echo "==> Pushing ${IMAGE}:${TAG}"
docker push "${IMAGE}:${TAG}"
docker push "${IMAGE}:latest"

echo "==> Done. Check UI: http://localhost:8080"