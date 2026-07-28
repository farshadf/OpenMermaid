#!/usr/bin/env sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

for command_name in cmp curl docker node rg; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if [ ! -f dist/index.html ]; then
  echo "dist/index.html is missing; run pnpm build first." >&2
  exit 1
fi

node scripts/dist-manifest.mjs verify

verify_suffix=$$
compose_project="open-mermaid-verify-${verify_suffix}"
image_tag="verify-${verify_suffix}"
app_port=${OPEN_MERMAID_VERIFY_APP_PORT:-18088}
caddy_port=${OPEN_MERMAID_VERIFY_CADDY_PORT:-18089}
editor_caddy_port=${OPEN_MERMAID_VERIFY_EDITOR_CADDY_PORT:-18090}
caddy_name="open-mermaid-caddy-verify-${verify_suffix}"
caddy_image="caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d"
verify_dir=$(mktemp -d)

compose() {
  OPEN_MERMAID_IMAGE_TAG="$image_tag" \
    OPEN_MERMAID_BIND_PORT="$app_port" \
    docker compose --project-name "$compose_project" "$@"
}

cleanup() {
  exit_status=$?
  set +e

  if [ "$exit_status" -ne 0 ]; then
    echo "Deployment verification failed; container diagnostics follow." >&2
    docker logs "$caddy_name" >&2 2>/dev/null || true
    compose logs --no-color >&2 2>/dev/null || true
  fi

  docker rm --force "$caddy_name" >/dev/null 2>&1 || true
  compose down --remove-orphans >/dev/null 2>&1 || true
  docker image rm "open-mermaid:${image_tag}" >/dev/null 2>&1 || true
  rm -rf -- "$verify_dir"

  trap - EXIT INT TERM
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

assert_header() {
  header_file=$1
  expected_pattern=$2
  description=$3

  if ! rg --ignore-case --quiet "$expected_pattern" "$header_file"; then
    echo "Missing or incorrect header: $description" >&2
    sed -n '1,80p' "$header_file" >&2
    exit 1
  fi
}

fetch() {
  url=$1
  header_file=$2
  body_file=$3
  curl --fail --silent --show-error --dump-header "$header_file" --output "$body_file" "$url"
}

echo "Validating Compose and Caddy configuration"
compose config --quiet
docker run --rm \
  --network none \
  --env OPEN_MERMAID_SITE=http://127.0.0.1:8080 \
  --env OPEN_MERMAID_EDITOR_SITE=http://127.0.0.1:8081 \
  --env OPEN_MERMAID_EDITOR_ORIGIN=http://127.0.0.1:8081 \
  --env OPEN_MERMAID_UPSTREAM=127.0.0.1:8088 \
  --volume "$project_root/ops/caddy/openmermaid.caddy:/etc/caddy/Caddyfile:ro" \
  "$caddy_image" \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null

echo "Building and starting the hardened artifact image"
compose build --pull
compose up --detach --wait --no-build

app_container=$(compose ps --quiet web)
if [ -z "$app_container" ]; then
  echo "Compose did not create the web container." >&2
  exit 1
fi

docker inspect "$app_container" >"$verify_dir/inspect.json"
node --input-type=module - "$verify_dir/inspect.json" <<'NODE'
import { readFileSync } from 'node:fs';

const [container] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const failures = [];
if (container.Config.User !== '101:101') failures.push('runtime user is not 101:101');
if (!container.HostConfig.ReadonlyRootfs) failures.push('root filesystem is writable');
if (!container.HostConfig.CapDrop?.includes('ALL')) failures.push('not all capabilities are dropped');
if (!container.HostConfig.SecurityOpt?.includes('no-new-privileges:true')) {
  failures.push('no-new-privileges is absent');
}
if (container.HostConfig.PidsLimit !== 100) failures.push('PID limit is not 100');
if (container.HostConfig.RestartPolicy?.Name !== 'unless-stopped') {
  failures.push('restart policy is not unless-stopped');
}
if (container.HostConfig.LogConfig?.Type !== 'local') failures.push('bounded local log driver is absent');
if (container.HostConfig.Binds?.length > 0 || container.Mounts?.length > 0) {
  failures.push('unexpected bind or persistent mount is present');
}
const published = container.NetworkSettings.Ports?.['8080/tcp'] ?? [];
if (published.length !== 1 || published[0].HostIp !== '127.0.0.1') {
  failures.push('port 8080 is not published only on 127.0.0.1');
}
if (container.State.Health?.Status !== 'healthy') failures.push('container is not healthy');
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
NODE

docker exec "$app_container" sh -c 'test ! -w /usr/share/nginx/html'
docker exec "$app_container" sh -c \
  'awk '\''$1 == "CapEff:" { exit $2 == "0000000000000000" ? 0 : 1 }'\'' /proc/1/status'

echo "Verifying that the container serves the exact manifest-backed artifact"
mkdir "$verify_dir/container-dist"
docker cp "$app_container:/usr/share/nginx/html/." "$verify_dir/container-dist"
cmp \
  dist/openmermaid-artifact-manifest.json \
  "$verify_dir/container-dist/openmermaid-artifact-manifest.json"
node scripts/dist-manifest.mjs verify --root "$verify_dir/container-dist"

app_origin="http://127.0.0.1:${app_port}"
fetch "$app_origin/" "$verify_dir/app-main.headers" "$verify_dir/app-main.html"
rg --quiet '<title>Open Mermaid' "$verify_dir/app-main.html"
assert_header "$verify_dir/app-main.headers" '^Content-Security-Policy: frame-ancestors '\''self'\''\r?$' 'main response CSP'
assert_header "$verify_dir/app-main.headers" '^Referrer-Policy: no-referrer\r?$' 'main referrer policy'
assert_header "$verify_dir/app-main.headers" '^Permissions-Policy: accelerometer=\(\), camera=\(\), geolocation=\(\), gyroscope=\(\), magnetometer=\(\), microphone=\(\), payment=\(\), usb=\(\), fullscreen=\(self\), clipboard-write=\(self\)\r?$' 'main permissions policy'
assert_header "$verify_dir/app-main.headers" '^X-Content-Type-Options: nosniff\r?$' 'main nosniff policy'
assert_header "$verify_dir/app-main.headers" '^X-Frame-Options: SAMEORIGIN\r?$' 'main framing policy'
assert_header "$verify_dir/app-main.headers" '^Cache-Control: public, max-age=0, must-revalidate\r?$' 'HTML revalidation'
assert_header "$verify_dir/app-main.headers" '^Cross-Origin-Opener-Policy: same-origin\r?$' 'main COOP'
assert_header "$verify_dir/app-main.headers" '^Cross-Origin-Resource-Policy: same-origin\r?$' 'main CORP'

fetch "$app_origin/healthz" "$verify_dir/health.headers" "$verify_dir/health.txt"
rg --quiet '^ok$' "$verify_dir/health.txt"
assert_header "$verify_dir/health.headers" '^Cache-Control: no-store\r?$' 'health no-store policy'

asset_path=$(find dist/_assets -maxdepth 1 -type f ! -name '*.map' -printf '/_assets/%f\n' -quit)
if [ -z "$asset_path" ]; then
  echo "No fingerprinted asset was found in dist/_assets." >&2
  exit 1
fi
fetch "$app_origin$asset_path" "$verify_dir/asset.headers" "$verify_dir/asset.body"
assert_header "$verify_dir/asset.headers" '^Cache-Control: public, max-age=31536000, immutable\r?$' 'immutable asset cache'

fetch "$app_origin/renderer/" "$verify_dir/renderer.headers" "$verify_dir/renderer.html"
assert_header "$verify_dir/renderer.headers" '^Content-Security-Policy: frame-ancestors '\''self'\''\r?$' 'renderer response CSP'
assert_header "$verify_dir/renderer.headers" '^Referrer-Policy: no-referrer\r?$' 'renderer referrer policy'
assert_header "$verify_dir/renderer.headers" '^Permissions-Policy: accelerometer=\(\), camera=\(\), geolocation=\(\), gyroscope=\(\), magnetometer=\(\), microphone=\(\), payment=\(\), usb=\(\)\r?$' 'renderer permissions policy'
assert_header "$verify_dir/renderer.headers" '^X-Content-Type-Options: nosniff\r?$' 'renderer nosniff policy'
assert_header "$verify_dir/renderer.headers" '^Cache-Control: public, max-age=0, must-revalidate\r?$' 'renderer revalidation'
if rg --ignore-case --quiet '^(Cross-Origin-Resource-Policy|Cross-Origin-Opener-Policy|X-Frame-Options):' "$verify_dir/renderer.headers"; then
  echo "The renderer received a main-application-only response header." >&2
  exit 1
fi

fetch "$app_origin/renderer/runtime.js" "$verify_dir/runtime.headers" "$verify_dir/runtime.js"
assert_header "$verify_dir/runtime.headers" '^Content-Type: (application|text)/javascript' 'renderer runtime MIME type'
assert_header "$verify_dir/runtime.headers" '^Cache-Control: public, max-age=0, must-revalidate\r?$' 'renderer runtime revalidation'

missing_status=$(curl --silent --dump-header "$verify_dir/404.headers" --output "$verify_dir/404.html" --write-out '%{http_code}' "$app_origin/not-a-real-route")
if [ "$missing_status" != 404 ]; then
  echo "Expected a real 404, received $missing_status." >&2
  exit 1
fi
rg --quiet 'Page not found' "$verify_dir/404.html"
assert_header "$verify_dir/404.headers" '^X-Robots-Tag: noindex, nofollow\r?$' '404 noindex policy'
assert_header "$verify_dir/404.headers" '^Cache-Control: public, max-age=0, must-revalidate\r?$' '404 revalidation'

missing_asset_status=$(curl --silent --dump-header "$verify_dir/missing-asset.headers" --output /dev/null --write-out '%{http_code}' "$app_origin/_assets/not-real.js")
if [ "$missing_asset_status" != 404 ]; then
  echo "Expected a missing asset to return 404, received $missing_asset_status." >&2
  exit 1
fi
if rg --ignore-case --quiet '^Cache-Control: .*immutable' "$verify_dir/missing-asset.headers"; then
  echo "A missing asset received immutable caching." >&2
  exit 1
fi

echo "Starting a pinned Caddy edge in front of the loopback-only container"
docker run --detach \
  --name "$caddy_name" \
  --network "${compose_project}_default" \
  --publish "127.0.0.1:${caddy_port}:8080" \
  --publish "127.0.0.1:${editor_caddy_port}:8081" \
  --read-only \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  --security-opt no-new-privileges:true \
  --tmpfs /data:rw,noexec,nosuid,nodev,size=16m,mode=0700 \
  --tmpfs /config:rw,noexec,nosuid,nodev,size=4m,mode=0700 \
  --env OPEN_MERMAID_SITE=http://:8080 \
  --env OPEN_MERMAID_EDITOR_SITE=http://:8081 \
  --env OPEN_MERMAID_EDITOR_ORIGIN="http://127.0.0.1:${editor_caddy_port}" \
  --env OPEN_MERMAID_UPSTREAM=web:8080 \
  --volume "$project_root/ops/caddy/openmermaid.caddy:/etc/caddy/Caddyfile:ro" \
  "$caddy_image" >/dev/null

attempt=0
until curl --fail --silent --output /dev/null "http://127.0.0.1:${caddy_port}/healthz"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Caddy did not become ready." >&2
    exit 1
  fi
  sleep 1
done

edge_origin="http://127.0.0.1:${caddy_port}"
editor_edge_origin="http://127.0.0.1:${editor_caddy_port}"
fetch "$edge_origin/" "$verify_dir/edge.headers" "$verify_dir/edge.html"
rg --quiet '<title>Open Mermaid' "$verify_dir/edge.html"
assert_header "$verify_dir/edge.headers" '^Strict-Transport-Security: max-age=31536000\r?$' 'production HSTS'
assert_header "$verify_dir/edge.headers" '^Content-Security-Policy: frame-ancestors '\''self'\''\r?$' 'proxied CSP'
if [ "$(rg --ignore-case --count '^Content-Security-Policy:' "$verify_dir/edge.headers")" -ne 1 ]; then
  echo "Caddy duplicated the response CSP." >&2
  exit 1
fi

editor_redirect_status=$(curl --silent --dump-header "$verify_dir/editor-redirect.headers" --output /dev/null --write-out '%{http_code}' "$edge_origin/editor/")
if [ "$editor_redirect_status" != 308 ]; then
  echo "Expected public /editor/ to redirect permanently, received $editor_redirect_status." >&2
  exit 1
fi
assert_header "$verify_dir/editor-redirect.headers" "^Location: ${editor_edge_origin}/editor/\r?$" 'isolated editor redirect'

public_renderer_status=$(curl --silent --output /dev/null --write-out '%{http_code}' "$edge_origin/renderer/")
if [ "$public_renderer_status" != 404 ]; then
  echo "Expected public /renderer/ to return 404, received $public_renderer_status." >&2
  exit 1
fi

fetch "$editor_edge_origin/editor/" "$verify_dir/editor-edge.headers" "$verify_dir/editor-edge.html"
rg --quiet '<title>Mermaid editor' "$verify_dir/editor-edge.html"
assert_header "$verify_dir/editor-edge.headers" '^Strict-Transport-Security: max-age=31536000\r?$' 'editor-origin HSTS'

editor_public_content_status=$(curl --silent --output /dev/null --write-out '%{http_code}' "$editor_edge_origin/guides/flowcharts/")
if [ "$editor_public_content_status" != 404 ]; then
  echo "Expected the editor origin to reject public content, received $editor_public_content_status." >&2
  exit 1
fi

curl --fail --silent --show-error \
  --header 'Accept-Encoding: gzip' \
  --dump-header "$verify_dir/compressed.headers" \
  --output /dev/null \
  "$edge_origin/"
assert_header "$verify_dir/compressed.headers" '^Content-Encoding: gzip\r?$' 'Caddy gzip negotiation'

edge_missing_status=$(curl --silent --output /dev/null --write-out '%{http_code}' "$edge_origin/not-a-real-route")
if [ "$edge_missing_status" != 404 ]; then
  echo "Caddy changed the real 404 into HTTP $edge_missing_status." >&2
  exit 1
fi

if [ "${OPEN_MERMAID_VERIFY_BROWSER:-false}" = true ]; then
  echo "Running the deployed editor and sandboxed-renderer browser smoke"
  node scripts/check-deployed-browser.mjs "$editor_edge_origin"
fi

docker logs "$caddy_name" >"$verify_dir/caddy.log" 2>&1
if rg --quiet '"level":"error"' "$verify_dir/caddy.log"; then
  echo "Caddy emitted an error during the integration test." >&2
  sed -n '1,160p' "$verify_dir/caddy.log" >&2
  exit 1
fi

# The harness intentionally uses plain HTTP on a high loopback port, so Caddy
# reports that HTTP/2 and HTTP/3 require TLS. Production uses automatic HTTPS;
# every other warning remains a gate failure.
if rg '"level":"warn"' "$verify_dir/caddy.log" | \
  rg --invert-match --quiet 'HTTP/[23] skipped because it requires TLS'; then
  echo "Caddy emitted an unexpected warning during the integration test." >&2
  sed -n '1,160p' "$verify_dir/caddy.log" >&2
  exit 1
fi

if compose logs --no-color 2>&1 | rg --ignore-case --quiet '\[(alert|crit|emerg|error)\]'; then
  echo "The static server emitted an Nginx error during the integration test." >&2
  compose logs --no-color >&2
  exit 1
fi

echo "Deployment verification passed: Compose hardening, static policy, and Caddy edge are healthy."
