# ---- build the web interface
FROM node:22-bookworm-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- runtime: API server + PostgreSQL client tools (pg_dump / pg_restore for backups)
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 ca-certificates \
    || (apt-get install -y --no-install-recommends curl gnupg && install -d /usr/share/postgresql-common/pgdg \
        && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
        && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
        && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16) \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package*.json server/
RUN npm ci --prefix server --omit=dev
COPY server/ server/
COPY --from=client /app/client/dist client/dist
ENV NODE_ENV=production PORT=4000 STORAGE_DIR=/data
VOLUME ["/data"]
EXPOSE 4000
CMD ["node", "server/src/index.js"]
