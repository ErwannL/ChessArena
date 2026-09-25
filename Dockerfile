# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:25-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:25-alpine AS runtime
LABEL org.opencontainers.image.title="ChessArena" \
      org.opencontainers.image.description="Échecs PvP / PvE / EvE avec bots paramétrables et classement Elo" \
      org.opencontainers.image.source="https://github.com/ErwannL/ChessArena" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app
# The server bundle has no runtime dependency: only the build output is shipped.
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/server/index.mjs"]
