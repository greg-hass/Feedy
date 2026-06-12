#!/bin/sh
set -eu

mkdir -p "${DATA_DIR:-/app/data}/icons" "${DATA_DIR:-/app/data}/exports"

case "${1:-web}" in
  migrate)
    npx prisma migrate deploy
    npm run seed
    ;;
  worker)
    exec npm run worker
    ;;
  web)
    exec npm run start
    ;;
  *)
    echo "Unknown entrypoint mode: ${1}" >&2
    exit 64
    ;;
esac
