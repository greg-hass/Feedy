# Deployment

Feedy is designed to run in Docker.

## Local Compose

Use `.env.example` as the starting point and run:

```bash
docker compose up --build
```

This starts:

- PostgreSQL
- Redis
- `web`
- `worker`

The first boot runs migrations, seeds the single user from environment variables, and then starts the services.

## Required settings

At minimum, set:

- `AUTH_SECRET`
- `APP_USERNAME`
- `APP_PASSWORD`
- `APP_URL`
- `COOKIE_SECURE`

For private LAN HTTP deployments, `COOKIE_SECURE=false` is expected. Public deployments should use HTTPS and `COOKIE_SECURE=true`.

## Deploying updates

On a server running the deploy compose file (or an equivalent stack compose):

```bash
docker compose pull
docker compose run --rm migrate   # one-shot migrations, container auto-removed
docker compose up -d
```

Always invoke the `migrate` service with `run --rm`. Using
`docker compose --profile migrate up migrate` leaves an exited container
behind, which tools like Dockge then report as the whole stack being
"exited" even while web/worker/postgres/redis keep running. If that has
already happened, clean it up with `docker rm feedy-migrate-1`.

## Reverse proxy

Put a proxy such as Caddy, Nginx, or Traefik in front of the `web` container and forward to port `3000`.

Recommended:

- preserve `Host`
- pass `X-Forwarded-*`
- terminate TLS at the proxy
- set `APP_URL` to the public HTTPS URL

## Production image

The Dockerfile builds the app, generates Prisma client code, and produces the standalone Next.js output. The deploy compose file uses the published image:

- `ghcr.io/greg-hass/feedy:latest`

## Recovery

If an older database has multiple users, repair it before startup:

```bash
npm run repair:single-user
```

