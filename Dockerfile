# ── Stage 1: build the React client ────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install client dependencies
COPY client/package*.json ./client/
RUN npm ci --prefix client

# Copy source and build (vite outDir is '../server/public')
COPY client/ ./client/
COPY server/ ./server/
RUN npm run build --prefix client

# ── Stage 2: production server ──────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install only server production dependencies
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev

# Copy server source and the client build from stage 1
COPY server/ ./server/
COPY --from=builder /app/server/public ./server/public

ENV NODE_ENV=production
# Cloud Run injects PORT=8080; the server falls back to 4000 locally
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
