#!/bin/sh
set -eu

mkdir -p "${DATA_DIR:-/app/data}/icons" "${DATA_DIR:-/app/data}/exports"

NODE_BIN="${NODE_BIN:-node}"
PRISMA_BIN="${PRISMA_BIN:-/opt/prisma/node_modules/.bin/prisma}"

case "${1:-web}" in
  migrate)
    "$PRISMA_BIN" migrate deploy --schema /app/prisma/schema.prisma
    "$NODE_BIN" /app/dist/prisma/seed.js
    ;;
  worker)
    exec "$NODE_BIN" /app/dist/src/worker.js
    ;;
  web)
    exec "$NODE_BIN" /app/server.js
    ;;
  *)
    echo "Unknown entrypoint mode: ${1}" >&2
    exit 64
    ;;
esac
