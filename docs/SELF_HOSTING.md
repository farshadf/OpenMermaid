# Docker behind host Caddy

This is the canonical self-hosted production profile for Open Mermaid. The application remains a
portable static artifact; Docker is its default packaging and serving boundary, and Caddy is the
only public network edge. Aggregate template-use telemetry is a separately packaged, optional
adapter and is not required by the application.

```text
Internet
  -> host Caddy on :80/:443
  -> 127.0.0.1:8088 on the same host
  -> unprivileged static container on :8080
  -> tested dist/ artifact
```

The default telemetry-off application has no server-side database, account service, API key, OpenAI
connection, analytics endpoint, or writable content volume. Browser documents remain in each
visitor's local browser storage. The optional aggregate profile adds only a dedicated telemetry
SQLite volume; it never receives browser documents.

## Prerequisites and ownership

- A supported Linux host with Docker Engine and the Docker Compose plugin.
- Caddy 2 installed as a host system service, or permission to install its official distribution package.
- Public DNS for the final canonical hostname pointing to the host.
- Inbound TCP 80 and 443 available to Caddy. Port 8088 must not be opened in a firewall or bound to a public address.
- A reviewed release built with Node 24, pinned pnpm, the frozen lockfile, the exact canonical HTTPS origin, and explicit indexing approval.

Keep these responsibilities separate:

- the release workflow builds and tests `dist/`;
- the `Dockerfile` packages that exact artifact without rebuilding it;
- the static container owns MIME types, real 404 behavior, cache policy, and the response-header translation from `public/_headers`;
- host Caddy owns public certificates, HTTP-to-HTTPS behavior, canonical-host redirects, dynamic compression, HSTS, and reverse proxying;
- Docker publishes the inner server only on host loopback.

Do not put Caddy in this Compose project. A host-level Caddy can safely serve other sites and remains available while an Open Mermaid container is replaced or rolled back.

## Build and verify an immutable release

From a clean, reviewed checkout, choose the final origin and an image tag tied to the source revision:

```bash
corepack enable
pnpm install --frozen-lockfile

export PUBLIC_SITE_URL=https://openmermaid.example
export PUBLIC_INDEX_SITE=true
export PUBLIC_TELEMETRY_MODE=off
export OPEN_MERMAID_IMAGE_TAG="$(git rev-parse --short=12 HEAD)"

pnpm build:release
pnpm test:metadata
pnpm test:independence
pnpm test:licenses
pnpm sbom
docker compose build --pull
pnpm exec playwright install chromium
pnpm test:deployment:browser
```

Replace the `.example` origin only after the domain and name clearance gates pass. The image build context contains only `dist/`, the Dockerfile, and the static-server configuration. It has no source checkout, package manager, build toolchain, application secret, or writable content volume.

`pnpm test:deployment` builds a temporary image and launches a pinned Caddy test edge. It asserts loopback-only publishing, non-root execution, a read-only root filesystem, dropped capabilities, health, MIME and cache policy, main and renderer headers, compression, and real 404 behavior. `pnpm test:deployment:browser` adds a real Chromium editor/iframe render smoke with external-request and console-error assertions; it is the release and CI gate. The harness uses ports 18088 and 18089 by default; when those are occupied, select unused loopback ports:

```bash
OPEN_MERMAID_VERIFY_APP_PORT=28088 \
OPEN_MERMAID_VERIFY_CADDY_PORT=28089 \
pnpm test:deployment:browser
```

Record the source commit, `dist/` checksum, image ID, pinned base-image digest, JavaScript SBOM, container SBOM from CI, and test reports together. A human-readable tag is an operator label, not cryptographic immutability; deployments promoted through a registry should use the resulting image digest.

## Start the static container

Persist the selected release tag in the deployment environment, then start the already-built image:

```bash
export OPEN_MERMAID_IMAGE_TAG=<reviewed-commit-id>
export OPEN_MERMAID_BIND_PORT=8088

docker compose up --detach --wait --no-build
docker compose ps
curl --fail --show-error http://127.0.0.1:8088/healthz
```

The resolved Compose configuration must show `host_ip: 127.0.0.1`. Never change the mapping to `8088:8080`, `0.0.0.0:8088:8080`, or a public host address. Docker warns that published container ports can bypass expected firewall behavior; the explicit loopback bind is part of the security boundary.

The runtime runs as UID/GID `101:101`, drops all Linux capabilities, enables `no-new-privileges`, limits PIDs and log growth, uses a read-only root, and provides only a small `tmpfs` for Nginx's runtime files. It mounts no Docker socket, source tree, credentials, or persistent volume.

## Optional aggregate template-use profile

Skip this section unless the release was deliberately built with
`PUBLIC_TELEMETRY_MODE=aggregate`. The static application remains the default and does not degrade
when the adapter is absent.

Set an exact canonical origin and source-derived image tags:

```bash
export PUBLIC_SITE_URL=https://openmermaid.example
export PUBLIC_INDEX_SITE=true
export PUBLIC_TELEMETRY_MODE=aggregate
export OPEN_MERMAID_IMAGE_TAG=<reviewed-commit-id>
export OPEN_MERMAID_TELEMETRY_IMAGE_TAG=<reviewed-commit-id>
export OPEN_MERMAID_TELEMETRY_ORIGIN=https://openmermaid.example
export OPEN_MERMAID_TELEMETRY_BIND_PORT=8091

pnpm build:release
pnpm test:metadata
pnpm test:independence
pnpm test:telemetry-deployment
docker compose -f compose.yml -f compose.telemetry.yml \
  up --detach --build --wait

curl --fail --show-error http://127.0.0.1:8088/healthz
curl --fail --show-error http://127.0.0.1:8091/healthz
```

The overlay builds the collector from `services/telemetry/`, publishes it only on host loopback,
and mounts one named SQLite volume at `/data`. The collector has no access to `dist/`, browser
documents, host Caddy state, the Docker socket, or unrelated host paths. Its root filesystem is
read-only and the container runs non-root with dropped capabilities and `no-new-privileges`.
The default runtime ceiling is 0.50 CPU, 256 MiB memory with no additional swap, 64 processes,
1,024 open files, and no core dumps. Treat those limits as a tested baseline and measure before
raising them.

The telemetry verifier uses ports 18188, 18189, and 18191 by default and removes its disposable
containers and SQLite volume on exit. When a port is occupied, select unused loopback ports:

```bash
OPEN_MERMAID_VERIFY_TELEMETRY_APP_PORT=28188 \
OPEN_MERMAID_VERIFY_TELEMETRY_EDGE_PORT=28189 \
OPEN_MERMAID_VERIFY_TELEMETRY_COLLECTOR_PORT=28191 \
pnpm test:telemetry-deployment
```

Install `ops/caddy/openmermaid-telemetry.caddy` for this profile. It routes only:

- `POST /api/telemetry/v1/template-uses`;
- `GET /api/telemetry/v1/template-counts`.

The collector's `/healthz` stays loopback-only. Never publish port 8091 to `0.0.0.0`, proxy a
catch-all API prefix, or expose the SQLite volume through the static service. Validate the complete
Caddyfile before reload and verify that unrelated sites are unchanged.

Turning the adapter off is two separate, deliberate operations: first deploy a newly tested
`PUBLIC_TELEMETRY_MODE=off` static artifact, then restore the ordinary
`ops/caddy/openmermaid.caddy` snippet and stop the telemetry overlay. Retain the SQLite volume until
the operator's approved retention/deletion decision; do not silently destroy it during an
application rollback.

The complete payload, opt-in, queue, aggregation, privacy, and validation contract is documented in
[`AGGREGATE_TELEMETRY.md`](AGGREGATE_TELEMETRY.md).

## Reuse or install host Caddy

First inspect the host without changing it:

```bash
command -v caddy || true
sudo systemctl status caddy --no-pager || true
sudo ss -ltnp '( sport = :80 or sport = :443 or sport = :8088 )'
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

If Caddy is absent, install the official package for the host distribution and use its provided `caddy.service`. Do not replace an unknown listener or overwrite an existing Caddyfile. Inventory every current site first. The official package is preferred for production because it installs the service account and systemd unit and integrates upgrades with the host package manager.

If Apache, Nginx, Traefik, or another service already owns 80/443, do not start Caddy beside it or stop it blindly. Choose one public edge: either schedule and verify a migration of every existing virtual host to Caddy, or translate this repository's header, health, compression, and proxy contract into the incumbent edge. Open Mermaid's loopback container can be prepared independently, but public cutover requires an explicit maintenance and rollback plan.

For an existing Caddy installation, keep site snippets in a directory imported by the main Caddyfile:

```caddyfile
import /etc/caddy/sites/*.caddy
```

Install the repository snippet as `/etc/caddy/sites/openmermaid.caddy`. It reads four non-secret service environment values:

```dotenv
OPEN_MERMAID_SITE=openmermaid.example
OPEN_MERMAID_EDITOR_SITE=app.openmermaid.example
OPEN_MERMAID_EDITOR_ORIGIN=https://app.openmermaid.example
OPEN_MERMAID_UPSTREAM=127.0.0.1:8088
```

Store those values in `/etc/openmermaid/caddy.env` with root ownership and mode `0644`, then add a systemd drop-in with `sudo systemctl edit caddy`:

```ini
[Service]
EnvironmentFile=/etc/openmermaid/caddy.env
```

Use the final hostnames, without an `http://` scheme, for production. They must be different. The
public hostname serves crawlable content and any agency inventory; the editor hostname serves only
the editor, renderer, and required local assets. This prevents agency JavaScript from sharing the
origin authority of editor IndexedDB. Hostname site addresses enable Caddy's automatic HTTPS and
HTTP-to-HTTPS redirects. The repository template has no hostname defaults, so validation fails
closed when either variable is absent.

Validate the complete configuration with the production values before any reload:

```bash
sudo env \
  OPEN_MERMAID_SITE=openmermaid.example \
  OPEN_MERMAID_EDITOR_SITE=app.openmermaid.example \
  OPEN_MERMAID_EDITOR_ORIGIN=https://app.openmermaid.example \
  OPEN_MERMAID_UPSTREAM=127.0.0.1:8088 \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

sudo systemctl daemon-reload
sudo systemctl reload caddy
```

For a newly installed service that is not running, use `sudo systemctl enable --now caddy` only after validation. Caddy reloads configuration gracefully; restarting a healthy shared edge is unnecessary for routine Open Mermaid updates.

The production snippet enables zstd/gzip, adds production-only HSTS, and actively checks `/healthz`.
It redirects public `/editor/` requests to the editor hostname, rejects the renderer on the public
hostname, and rejects public-content routes on the editor hostname. It does not duplicate the
build-derived script/style CSP. Multiple CSP policies are intersected by browsers, so a stale
handwritten hash list can break a correct release. The inner server supplies the tested main and
renderer response policies, and Caddy passes them through.

Do not use the production snippet for a preview hostname: previews require a separate site block, `PUBLIC_INDEX_SITE=false`, `X-Robots-Tag: noindex, nofollow`, access control when appropriate, and no HSTS. Do not add `includeSubDomains` or `preload` to HSTS without a separate audit of every affected hostname.

## Canonical aliases

After the canonical TLD is selected, add each alternate hostname to the commented redirect block in `ops/caddy/openmermaid.caddy`. Redirect aliases directly to the one canonical HTTPS origin and preserve `{uri}`. Avoid redirect chains, and verify that certificates cover every hostname before advertising it.

The application build and the Caddy canonical hostname must match exactly. `.app`, `.us`, or another TLD remains a release decision; Docker and Caddy do not constrain it.

## Post-deployment verification

Run these checks against the actual public origin, not only loopback:

```bash
export OPEN_MERMAID_ORIGIN=https://openmermaid.example
export OPEN_MERMAID_EDITOR_ORIGIN=https://app.openmermaid.example

curl --fail --silent --show-error --head "$OPEN_MERMAID_ORIGIN/"
curl --fail --silent --show-error --head "$OPEN_MERMAID_ORIGIN/editor/"
curl --fail --silent --show-error --head "$OPEN_MERMAID_ORIGIN/renderer/"
curl --fail --silent --show-error --head "$OPEN_MERMAID_ORIGIN/renderer/runtime.js"
curl --fail --silent --show-error --head "$OPEN_MERMAID_EDITOR_ORIGIN/editor/"
curl --fail --silent --show-error --head "$OPEN_MERMAID_EDITOR_ORIGIN/renderer/"
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  "$OPEN_MERMAID_EDITOR_ORIGIN/guides/flowcharts/"
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  "$OPEN_MERMAID_ORIGIN/not-a-real-route"
```

Confirm all of the following:

- HTTP redirects once to the canonical HTTPS URL, preserving path and query.
- Public `/editor/` redirects to the editor hostname; public `/renderer/` returns 404.
- The editor hostname serves `/editor/` and `/renderer/` but returns 404 for public guide/template
  pages, so agency code cannot execute with editor-origin storage authority.
- The certificate is valid for the public host, editor host, and all configured aliases.
- Main responses contain the response-only framing CSP, HSTS, referrer, permissions, nosniff, framing, COOP, and CORP policies exactly as documented.
- Renderer responses use the narrower renderer policy and can load only the local stable runtime.
- `/_assets/*` is immutable; HTML, renderer files, policies, and 404 responses revalidate.
- An unknown path returns the built page with status 404 and noindex, not a 200 SPA fallback.
- Caddy negotiates zstd or gzip while the origin container does not pre-compress dynamically.
- Editor load, persistence, sharing, import, SVG/PNG export, and sandbox rendering pass in a fresh browser profile with no unexpected external request.

Inspect warnings and errors explicitly:

```bash
docker compose ps
docker compose logs --since 15m --no-color
sudo journalctl -u caddy --since '15 minutes ago' --no-pager
```

Nginx access logging is disabled and Caddy access logging is not enabled by the supplied snippets.
The optional collector also emits no per-request access log. This avoids creating a second
analytics-like data stream by default. If operational access logs are later enabled, define
retention, access controls, redaction, and privacy wording first; IP addresses and user agents are
personal or sensitive operational data in many contexts.

## Update and rollback

Build and verify every update under a new source-derived image tag. Keep at least the current and previous known-good image digests and their matching `dist/` checksums. Promote without rebuilding:

```bash
export OPEN_MERMAID_IMAGE_TAG=<new-reviewed-commit-id>
docker compose up --detach --wait --no-build
curl --fail --show-error http://127.0.0.1:8088/healthz
```

Then repeat the public checks and warning scan. If any security, availability, persistence, browser, or metadata gate fails, restore the previous image:

```bash
export OPEN_MERMAID_IMAGE_TAG=<previous-known-good-commit-id>
docker compose up --detach --wait --no-build
curl --fail --show-error http://127.0.0.1:8088/healthz
sudo systemctl reload caddy
```

Caddy normally does not change for an application-only rollback; reload it only when its validated
configuration was also restored. Do not delete the failed image or previous artifact until the
incident is understood. Open Mermaid has no server-side document database to migrate, but browser
storage compatibility must still be included in rollback smoke tests. The optional telemetry
database is not a document store; retain or remove it only under its separate operational policy.

## Upgrades and supply chain

The Nginx base uses an exact release tag plus multi-platform image-index digest. Dependabot monitors the Dockerfile weekly; a base update still requires the full deployment test and license/security review. Caddy should be updated through its official host package channel and validated before reload.

CI produces separate inventories for JavaScript/build dependencies and the shipped container image. Retain both SBOMs, the complete license report, source commit, base digest, built-image digest, and artifact checksum with each release. A digest pin prevents unexpected base drift; it does not replace vulnerability review or timely rebuilding.

## Operational references

- [Caddy installation](https://caddyserver.com/docs/install) and [systemd service guidance](https://caddyserver.com/docs/running)
- [Caddy reverse proxy and active health checks](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Caddy automatic HTTPS site addresses](https://caddyserver.com/docs/caddyfile/concepts)
- [Docker port-publishing security](https://docs.docker.com/engine/network/port-publishing/)
- [Docker Compose service hardening fields](https://docs.docker.com/reference/compose-file/services/)
- [NGINX Unprivileged image behavior and release policy](https://github.com/nginx/docker-nginx-unprivileged)
