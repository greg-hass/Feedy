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

# Copy static files into standalone for self-contained runtime
RUN mkdir -p .next/standalone/.next/static && cp -r .next/static/* .next/standalone/.next/static/ 2>/dev/null || true
RUN cp -r public .next/standalone/ 2>/dev/null || true

# ------------------------------------------------------------------

FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 feedy && useradd --system --uid 1001 --gid feedy feedy

# Standalone Next.js output for the web server (includes its own node_modules)
COPY --from=builder /app/.next/standalone /app/.next/standalone

# Prisma schema and migrations for prisma migrate deploy
COPY prisma/ prisma/

# Worker-runtime dependencies: production deps + tsx + prisma CLI
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    npm install --no-save --ignore-scripts tsx prisma && \
    rm -rf /root/.npm

# Generated Prisma client + engine binaries (needed by migrate, seed, worker).
# Copy after npm ci because npm replaces node_modules.
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/engines node_modules/@prisma/engines

# Worker source files (web uses bundled standalone; worker runs via tsx)
COPY src/worker.ts src/worker.ts
COPY src/healthcheck.ts src/healthcheck.ts
COPY src/lib/ src/lib/
COPY src/types/ src/types/

COPY docker/entrypoint.sh docker/entrypoint.sh
RUN chmod +x docker/entrypoint.sh

# /app/data stores cached icons/exports. Prisma also writes engine metadata
# during migrate deploy, so keep its runtime engine directories writable.
RUN mkdir -p /app/data/icons /app/data/exports /home/feedy && \
    chown -R feedy:feedy /app/data /home/feedy /app/node_modules/@prisma /app/node_modules/prisma

ENV HOME=/home/feedy

EXPOSE 3000
USER feedy
CMD ["./docker/entrypoint.sh", "web"]
