#!/usr/bin/env bash
# deploy/predeploy.sh: run by adlc-swarm-deploy before the stack update (IMAGE_TAG, STACK exported).
# Runs DB migrations from the NEW image as a one-off Swarm service; non-zero exit aborts the deploy.
set -euo pipefail
: "${IMAGE_TAG:?}" "${STACK:?}"
ns=${REGISTRY_NS:-harbor.example.com/project/app}
svc="${STACK}-migrate-${IMAGE_TAG}"
docker service create --detach=false --with-registry-auth --name "$svc" \
  --restart-condition none --network "${STACK}_internal" \
  --secret app_database_url_v1 -e DATABASE_URL_FILE=/run/secrets/app_database_url_v1 \
  "$ns/api:$IMAGE_TAG" node dist/migrate.js >/dev/null
state=$(docker service ps "$svc" --format '{{.CurrentState}}' | head -1)
docker service logs "$svc" 2>/dev/null | tail -20
docker service rm "$svc" >/dev/null
case "$state" in Complete*) echo "migrations applied" ;; *) echo "migration failed: $state" >&2; exit 1 ;; esac
