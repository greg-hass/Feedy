FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# Copy static files to correct location for standalone mode
RUN mkdir -p .next/standalone/.next/static && cp -r .next/static/* .next/standalone/.next/static/ 2>/dev/null || true
RUN cp -r public .next/standalone/ 2>/dev/null || true

EXPOSE 3000
CMD ["./docker/entrypoint.sh", "web"]
