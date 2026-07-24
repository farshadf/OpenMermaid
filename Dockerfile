# syntax=docker/dockerfile:1.7

# The release pipeline builds and tests dist/ before this artifact-only image is
# assembled. Keep both the version and multi-platform image index immutable.
FROM nginxinc/nginx-unprivileged:1.30.4-alpine-slim@sha256:e88d990b349df8cf4aa82f16642d7a23375016638c9ace4e5c6ca25028e62e65

LABEL org.opencontainers.image.title="Open Mermaid" \
      org.opencontainers.image.description="Standalone browser-based Mermaid editor" \
      org.opencontainers.image.licenses="MIT"

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
