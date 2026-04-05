#!/bin/sh
set -eu

mkdir -p "${DATA_DIR:-/app/data}/icons" "${DATA_DIR:-/app/data}/exports"

npx prisma migrate deploy
npm run seed

if [ "${1:-web}" = "worker" ]; then
  exec npm run worker
fi

exec npm run start
