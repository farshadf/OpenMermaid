# syntax=docker/dockerfile:1.7.0@sha256:dbbd5e059e8a07ff7ea6233b213b36aa516b4c53c645f1817a4dd18b83cbea56

# The release pipeline builds and tests dist/ before this artifact-only image is
# assembled. Keep both the version and multi-platform image index immutable.
FROM nginxinc/nginx-unprivileged:1.31.7-alpine-slim@sha256:a8cb0f33d51fa107c96fd2bd3a71aaf564ec131e9d2bdf8700944f0ed8b170d7

LABEL org.opencontainers.image.title="Open Mermaid" \
      org.opencontainers.image.description="Standalone browser-based Mermaid editor" \
      org.opencontainers.image.licenses="MIT"

# The upstream image contains default index and error pages. Empty its complete
# document root so the runtime can contain only the verified dist/ artifact.
USER 0
RUN find /usr/share/nginx/html -mindepth 1 -delete

COPY --chown=0:0 --chmod=0444 ops/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=0:0 --chmod=0444 ops/docker/main-security-headers.conf /etc/nginx/main-security-headers.conf
COPY --chown=0:0 --chmod=0444 ops/docker/renderer-security-headers.conf /etc/nginx/renderer-security-headers.conf
COPY --chown=0:0 --chmod=0555 ops/docker/healthcheck.sh /usr/local/bin/openmermaid-healthcheck
COPY --chown=0:0 dist/ /usr/share/nginx/html/

USER 101:101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/usr/local/bin/openmermaid-healthcheck"]

STOPSIGNAL SIGQUIT
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
