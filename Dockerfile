# One image for the whole site: the Node service answers /api and serves the
# built SPA. This is the image FAF's cluster runs (published by
# .github/workflows/image.yml), and docker-compose.yml builds the same one.

# ---- Build stage ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The client (typechecked by `build`) and the server bundled into one file,
# so the runtime image needs no node_modules at all.
RUN npm run build && npm run build:server

# ---- Runtime stage ----
FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/build/server.mjs ./server.mjs

# The answer secret and the solve counter live on a volume at /data, owned by
# the unprivileged `node` user (uid 1000) the process runs as.
ENV NODE_ENV=production \
    PORT=8090 \
    STATIC_DIR=/app/dist \
    DAILY_SECRET_FILE=/data/secret \
    DAILY_STATS_FILE=/data/stats.json
RUN mkdir -p /data && chown node:node /data
VOLUME /data

USER node
EXPOSE 8090
CMD ["node", "server.mjs"]
