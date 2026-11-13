FROM node:22-slim AS ui-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM golang:1.27.4-bookworm AS api-builder
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /zephyr ./cmd/zephyr

FROM node:22-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 zephyr && useradd --system --uid 1001 --gid zephyr zephyr
COPY --from=ui-builder --chown=zephyr:zephyr /app/.next/standalone ./
COPY --from=ui-builder --chown=zephyr:zephyr /app/.next/static ./.next/static
COPY --from=ui-builder --chown=zephyr:zephyr /app/public ./public
COPY --from=api-builder /zephyr ./zephyr
COPY --chown=zephyr:zephyr docker-entrypoint.sh ./
RUN mkdir -p uploads && chown zephyr:zephyr uploads && chmod +x docker-entrypoint.sh
USER zephyr
ENV NODE_ENV=production
ENV API_ADDR=0.0.0.0:3000
ENV UI_ORIGIN=http://127.0.0.1:3001
ENV UI_SERVER_PATH=/app/server.js
ENV UPLOAD_DIR=/app/uploads
ENV LEGACY_UPLOAD_DIR=/app/public/uploads
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./docker-entrypoint.sh"]
