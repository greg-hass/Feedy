FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 feedy && useradd --system --uid 1001 --gid feedy feedy

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# Copy static files to correct location for standalone mode
RUN mkdir -p .next/standalone/.next/static && cp -r .next/static/* .next/standalone/.next/static/ 2>/dev/null || true
RUN cp -r public .next/standalone/ 2>/dev/null || true

RUN mkdir -p /app/data/icons /app/data/exports && chown -R feedy:feedy /app

EXPOSE 3000
USER feedy
CMD ["./docker/entrypoint.sh", "web"]
