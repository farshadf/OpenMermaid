FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd

LABEL org.opencontainers.image.title="Open Mermaid aggregate telemetry collector" \
      org.opencontainers.image.description="Optional privacy-minimized first-party template usage collector"

ENV NODE_ENV=production \
    OPEN_MERMAID_TELEMETRY_PORT=8091 \
    OPEN_MERMAID_TELEMETRY_DATABASE_PATH=/data/telemetry.sqlite

WORKDIR /app

RUN install -d -o root -g root -m 0555 /app/src && \
    install -d -o node -g node -m 0700 /data

COPY --chown=node:node --chmod=0444 package.json catalog.json ./
COPY --chown=node:node --chmod=0444 src/server.ts ./src/

USER node
EXPOSE 8091
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8091/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT []
CMD ["node", "src/server.ts"]
