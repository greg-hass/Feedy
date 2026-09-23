FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma/ prisma/
RUN npx prisma generate

COPY . .
RUN npm run build

# Bundle background processes so the runtime does not need the complete 800 MB
# production dependency tree or tsx. jsdom and Prisma stay external because
# Next's standalone output already contains their native/runtime files.
RUN npx esbuild src/worker.ts src/healthcheck.ts prisma/seed.ts \
    --bundle --platform=node --format=cjs --target=node22 \
    --outdir=/app/dist \
    --external:@prisma/client --external:.prisma/* --external:jsdom

# ------------------------------------------------------------------

FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    HOME=/home/feedy

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd --system --gid 1001 feedy && \
    useradd --system --uid 1001 --gid feedy --home-dir /home/feedy feedy

# Next standalone includes only traced web dependencies. Copy directly to /app
# so bundled workers can resolve its jsdom and generated Prisma client.
COPY --from=builder --chown=feedy:feedy /app/.next/standalone ./
COPY --from=builder --chown=feedy:feedy /app/.next/static ./.next/static
COPY --from=builder --chown=feedy:feedy /app/public ./public
COPY --from=builder --chown=feedy:feedy /app/dist ./dist
COPY --from=builder --chown=feedy:feedy /app/prisma ./prisma

# Keep the migration CLI isolated from the application dependency tree. This is
# substantially smaller than reinstalling every web and worker dependency.
RUN mkdir -p /opt/prisma /app/data/icons /app/data/exports /app/.next/cache /home/feedy && \
    cd /opt/prisma && npm install --no-save --ignore-scripts prisma@6.7.0 && \
    rm -rf /root/.npm && \
    chown -R feedy:feedy /opt/prisma /app/data /app/.next/cache /home/feedy

COPY --chown=feedy:feedy docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod 0555 ./docker/entrypoint.sh

EXPOSE 3000
USER feedy
CMD ["./docker/entrypoint.sh", "web"]
