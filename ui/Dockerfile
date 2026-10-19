# ADLC dashboard: React web app (built here) + Fastify server. Build context: ui/.
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 ADLC_DATA=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/package.json server/lib.js server/server.js ./
COPY --from=web /web/dist ./public
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
