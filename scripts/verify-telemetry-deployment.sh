#!/usr/bin/env sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

for command_name in curl docker node rg; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

pnpm_run() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
  elif command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
  else
    echo "Missing required command: pnpm (or corepack)." >&2
    exit 1
  fi
}

verify_suffix=$$
compose_project="open-mermaid-telemetry-verify-${verify_suffix}"
app_image_tag="telemetry-verify-${verify_suffix}"
telemetry_image_tag="verify-${verify_suffix}"
app_port=${OPEN_MERMAID_VERIFY_TELEMETRY_APP_PORT:-18188}
edge_port=${OPEN_MERMAID_VERIFY_TELEMETRY_EDGE_PORT:-18189}
collector_port=${OPEN_MERMAID_VERIFY_TELEMETRY_COLLECTOR_PORT:-18191}
edge_origin="http://127.0.0.1:${edge_port}"
caddy_name="open-mermaid-telemetry-caddy-verify-${verify_suffix}"
probe_name="open-mermaid-telemetry-header-probe-${verify_suffix}"
caddy_image="caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d"
verify_dir=$(mktemp -d)

compose() {
  OPEN_MERMAID_IMAGE_TAG="$app_image_tag" \
    OPEN_MERMAID_BIND_PORT="$app_port" \
    OPEN_MERMAID_TELEMETRY_IMAGE_TAG="$telemetry_image_tag" \
    OPEN_MERMAID_TELEMETRY_BIND_PORT="$collector_port" \
    OPEN_MERMAID_TELEMETRY_ORIGIN="$edge_origin" \
    docker compose \
      --project-name "$compose_project" \
      --file compose.yml \
      --file compose.telemetry.yml \
      "$@"
}

start_caddy() {
  caddy_telemetry_upstream=$1
  docker run --detach \
    --name "$caddy_name" \
    --network "${compose_project}_default" \
    --publish "127.0.0.1:${edge_port}:8080" \
    --read-only \
    --user 1000:1000 \
    --cap-drop ALL \
    --cap-add NET_BIND_SERVICE \
    --security-opt no-new-privileges:true \
    --pids-limit 64 \
    --memory 128m \
    --memory-swap 128m \
    --cpus 0.50 \
    --ulimit nofile=1024:1024 \
    --ulimit core=0:0 \
    --tmpfs /data:rw,noexec,nosuid,nodev,size=16m,mode=0700,uid=1000,gid=1000 \
    --tmpfs /config:rw,noexec,nosuid,nodev,size=4m,mode=0700,uid=1000,gid=1000 \
    --env OPEN_MERMAID_SITE=http://:8080 \
    --env OPEN_MERMAID_UPSTREAM=web:8080 \
    --env "OPEN_MERMAID_TELEMETRY_UPSTREAM=${caddy_telemetry_upstream}" \
    --volume "$project_root/ops/caddy/openmermaid-telemetry.caddy:/etc/caddy/Caddyfile:ro" \
    "$caddy_image" >/dev/null
}

cleanup() {
  exit_status=$?
  set +e

  if [ "$exit_status" -ne 0 ]; then
    echo "Aggregate telemetry deployment verification failed; diagnostics follow." >&2
    docker logs "$caddy_name" >&2 2>/dev/null || true
    compose logs --no-color >&2 2>/dev/null || true
  fi

  docker rm --force "$caddy_name" >/dev/null 2>&1 || true
  docker rm --force "$probe_name" >/dev/null 2>&1 || true
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker image rm "open-mermaid:${app_image_tag}" >/dev/null 2>&1 || true
  docker image rm "open-mermaid-telemetry:${telemetry_image_tag}" >/dev/null 2>&1 || true
  rm -rf -- "$verify_dir"

  trap - EXIT INT TERM
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

assert_status() {
  actual=$1
  expected=$2
  description=$3
  if [ "$actual" != "$expected" ]; then
    echo "$description: expected HTTP $expected, received HTTP $actual." >&2
    exit 1
  fi
}

request_status() {
  output_file=$1
  shift
  curl --silent --show-error --output "$output_file" --write-out '%{http_code}' "$@"
}

assert_caddy_log() {
  log_file=$1
  if rg --quiet '"level":"error"' "$log_file"; then
    echo "Caddy emitted an error during telemetry integration verification." >&2
    sed -n '1,160p' "$log_file" >&2
    exit 1
  fi
  if rg '"level":"warn"' "$log_file" | \
    rg --invert-match --quiet 'HTTP/[23] skipped because it requires TLS'; then
    echo "Caddy emitted an unexpected warning during telemetry integration verification." >&2
    sed -n '1,160p' "$log_file" >&2
    exit 1
  fi
}

valid_event_id="45bf4f19-0896-4998-81b3-5b49ad493a1c"
valid_template_id="flowchart-starter"
catalog_version=$(node --input-type=module -e \
  "import catalog from './services/telemetry/catalog.json' with { type: 'json' }; process.stdout.write(catalog.catalogVersion)")

node --input-type=module - "$verify_dir/valid-event.json" "$valid_event_id" "$valid_template_id" "$catalog_version" <<'NODE'
import { writeFileSync } from 'node:fs';

const [, , outputPath, eventId, templateId, catalogVersion] = process.argv;
writeFileSync(
  outputPath,
  JSON.stringify({
    schemaVersion: 1,
    events: [{ eventId, kind: 'template_applied', templateId, catalogVersion }],
  }),
);
NODE

echo "Building and checking the aggregate browser artifact"
(
  export PUBLIC_SITE_URL=https://openmermaid.test
  export PUBLIC_INDEX_SITE=false
  export PUBLIC_TELEMETRY_MODE=aggregate
  pnpm_run build
  pnpm_run test:metadata
  unset OPENAI_API_KEY CHATGPT_APP_ID MCP_SERVER_URL
  pnpm_run test:independence
)
node --input-type=module - "$catalog_version" <<'NODE'
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync('dist/openmermaid-artifact-manifest.json', 'utf8'),
);
if (
  manifest.schemaVersion !== 2 ||
  manifest.buildProfile?.telemetryMode !== 'aggregate' ||
  manifest.buildProfile?.telemetryCatalogVersion !== process.argv[2]
) {
  throw new Error('The built artifact manifest is not bound to the aggregate telemetry profile.');
}
NODE

echo "Validating the aggregate Compose overlay and pinned Caddy profile"
compose config --quiet
compose config >"$verify_dir/compose.resolved.yml"
rg --quiet "host_ip: 127\\.0\\.0\\.1" "$verify_dir/compose.resolved.yml"
rg --quiet "target: /data" "$verify_dir/compose.resolved.yml"
rg --quiet "read_only: true" "$verify_dir/compose.resolved.yml"

docker run --rm \
  --network none \
  --env OPEN_MERMAID_SITE=http://127.0.0.1:8080 \
  --env OPEN_MERMAID_UPSTREAM=127.0.0.1:8088 \
  --env OPEN_MERMAID_TELEMETRY_UPSTREAM=127.0.0.1:8091 \
  --volume "$project_root/ops/caddy/openmermaid-telemetry.caddy:/etc/caddy/Caddyfile:ro" \
  "$caddy_image" \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null

echo "Building and starting the static and telemetry images"
compose build --pull
compose up --detach --wait --no-build

telemetry_container=$(compose ps --quiet telemetry)
if [ -z "$telemetry_container" ]; then
  echo "Compose did not create the telemetry container." >&2
  exit 1
fi

docker inspect "$telemetry_container" >"$verify_dir/telemetry.inspect.json"
node --input-type=module - "$verify_dir/telemetry.inspect.json" <<'NODE'
import { readFileSync } from 'node:fs';

const [container] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const failures = [];
if (container.Config.User !== '1000:1000') failures.push('runtime user is not 1000:1000');
if (!container.HostConfig.ReadonlyRootfs) failures.push('root filesystem is writable');
if (!container.HostConfig.CapDrop?.includes('ALL')) failures.push('not all capabilities are dropped');
if (!container.HostConfig.SecurityOpt?.includes('no-new-privileges:true')) {
  failures.push('no-new-privileges is absent');
}
if (container.HostConfig.PidsLimit !== 64) failures.push('PID limit is not 64');
if (container.HostConfig.NanoCpus !== 500_000_000) failures.push('CPU limit is not 0.50');
if (container.HostConfig.Memory !== 268_435_456) failures.push('memory limit is not 256 MiB');
if (container.HostConfig.MemoryReservation !== 67_108_864) {
  failures.push('memory reservation is not 64 MiB');
}
if (container.HostConfig.MemorySwap !== 268_435_456) {
  failures.push('memory plus swap limit is not 256 MiB');
}
const nofile = container.HostConfig.Ulimits?.find((entry) => entry.Name === 'nofile');
if (nofile?.Soft !== 1_024 || nofile?.Hard !== 1_024) {
  failures.push('nofile limit is not 1024:1024');
}
const core = container.HostConfig.Ulimits?.find((entry) => entry.Name === 'core');
if (core?.Soft !== 0 || core?.Hard !== 0) failures.push('core dumps are not disabled');
if (container.HostConfig.RestartPolicy?.Name !== 'unless-stopped') {
  failures.push('restart policy is not unless-stopped');
}
if (container.HostConfig.LogConfig?.Type !== 'local') failures.push('bounded local logging is absent');
if (container.HostConfig.Tmpfs?.['/tmp'] === undefined) failures.push('/tmp is not a tmpfs');
const dataMounts = container.Mounts?.filter((mount) => mount.Destination === '/data') ?? [];
if (
  dataMounts.length !== 1 ||
  dataMounts[0].Type !== 'volume' ||
  container.Mounts.length !== 1
) {
  failures.push('the dedicated /data volume is not the only persistent mount');
}
const published = container.NetworkSettings.Ports?.['8091/tcp'] ?? [];
if (published.length !== 1 || published[0].HostIp !== '127.0.0.1') {
  failures.push('port 8091 is not published only on 127.0.0.1');
}
if (container.State.Health?.Status !== 'healthy') failures.push('container is not healthy');
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
NODE

docker exec "$telemetry_container" sh -c 'test ! -w /app/src/server.ts && test -w /data'
docker exec "$telemetry_container" sh -c \
  'awk '\''$1 == "CapEff:" { exit $2 == "0000000000000000" ? 0 : 1 }'\'' /proc/1/status'

collector_origin="http://127.0.0.1:${collector_port}"
curl --fail --silent --show-error "$collector_origin/healthz" >"$verify_dir/direct-health.txt"
rg --quiet '^ok$' "$verify_dir/direct-health.txt"
curl --fail --silent --show-error \
  --dump-header "$verify_dir/direct-metrics.headers" \
  --output "$verify_dir/direct-metrics.body" \
  "$collector_origin/metrics"
rg --ignore-case --quiet '^Cache-Control: no-store\r?$' "$verify_dir/direct-metrics.headers"
rg --ignore-case --quiet \
  '^Content-Type: text/plain; version=0\.0\.4; charset=utf-8\r?$' \
  "$verify_dir/direct-metrics.headers"
rg --quiet '^openmermaid_telemetry_http_requests_total [0-9]+$' \
  "$verify_dir/direct-metrics.body"
rg --quiet '^openmermaid_telemetry_events_accepted_total [0-9]+$' \
  "$verify_dir/direct-metrics.body"
rg --quiet '^openmermaid_telemetry_database_healthy 1$' \
  "$verify_dir/direct-metrics.body"
if rg --fixed-strings --quiet \
  -e "$valid_event_id" \
  -e "$valid_template_id" \
  -e "$edge_origin" \
  "$verify_dir/direct-metrics.body"; then
  echo "Loopback metrics exposed event, template, or origin data." >&2
  exit 1
fi
node --input-type=module - "$verify_dir/direct-metrics.body" <<'NODE'
import { readFileSync } from 'node:fs';

const allowedNames = new Set([
  'openmermaid_telemetry_http_requests_total',
  'openmermaid_telemetry_http_responses_total',
  'openmermaid_telemetry_http_response_codes_total',
  'openmermaid_telemetry_events_accepted_total',
  'openmermaid_telemetry_events_deduplicated_total',
  'openmermaid_telemetry_storage_errors_total',
  'openmermaid_telemetry_maintenance_errors_total',
  'openmermaid_telemetry_database_healthy',
  'openmermaid_telemetry_database_bytes',
  'openmermaid_telemetry_wal_bytes',
]);
for (const line of readFileSync(process.argv[2], 'utf8').split(/\r?\n/u)) {
  if (line === '' || line.startsWith('# ')) continue;
  const match =
    /^(openmermaid_telemetry_[a-z_]+)(?:\{(class="[2345]xx"|code="(?:204|400|403|404|405|413|415|429|500|503)")\})? ([0-9]+)$/u.exec(
      line,
    );
  if (match === null || !allowedNames.has(match[1])) {
    throw new Error(`Unexpected metric or visitor-level label: ${line}`);
  }
}
NODE

echo "Verifying collector persistence and event-id deduplication"
direct_status=$(request_status "$verify_dir/direct-valid.body" \
  --request POST \
  --header "Origin: $edge_origin" \
  --header 'Content-Type: application/json' \
  --header 'X-OpenMermaid-Telemetry-Version: 1' \
  --header 'Sec-Fetch-Site: same-origin' \
  --data-binary "@$verify_dir/valid-event.json" \
  "$collector_origin/api/telemetry/v1/template-uses")
assert_status "$direct_status" 204 "Direct valid event"

read_total() {
  docker exec "$telemetry_container" node --no-warnings --input-type=module -e \
    "import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync('/data/telemetry.sqlite', { readOnly: true }); const row = db.prepare('SELECT count FROM template_usage_totals WHERE catalog_version = ? AND template_id = ?').get('$catalog_version', '$valid_template_id'); process.stdout.write(String(row?.count ?? 0)); db.close();"
}

if [ "$(read_total)" != 1 ]; then
  echo "The first accepted event was not persisted exactly once." >&2
  exit 1
fi

if docker exec "$telemetry_container" node --no-warnings --input-type=module -e \
  "import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync('/data/telemetry.sqlite', { readOnly: true }); const rows = db.prepare('SELECT event_hash FROM received_events').all(); const unsafe = rows.some(({ event_hash }) => event_hash === '$valid_event_id' || !/^[a-f0-9]{64}$/.test(event_hash)); db.close(); process.exit(unsafe ? 1 : 0);"
then
  :
else
  echo "The deduplication table contains a raw or malformed event identifier." >&2
  exit 1
fi

compose up --detach --force-recreate --wait --no-build telemetry
telemetry_container=$(compose ps --quiet telemetry)

direct_status=$(request_status "$verify_dir/direct-duplicate.body" \
  --request POST \
  --header "Origin: $edge_origin" \
  --header 'Content-Type: application/json' \
  --header 'X-OpenMermaid-Telemetry-Version: 1' \
  --data-binary "@$verify_dir/valid-event.json" \
  "$collector_origin/api/telemetry/v1/template-uses")
assert_status "$direct_status" 204 "Persisted duplicate event"
if [ "$(read_total)" != 1 ]; then
  echo "An event replay after container recreation changed the aggregate total." >&2
  exit 1
fi

echo "Starting the pinned Caddy edge and exercising its exact API boundary"
start_caddy telemetry:8091

attempt=0
until curl --fail --silent --output /dev/null "$edge_origin/healthz"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "The telemetry Caddy edge did not become ready." >&2
    exit 1
  fi
  sleep 1
done

edge_status=$(request_status "$verify_dir/edge-valid.body" \
  --request POST \
  --header "Origin: $edge_origin" \
  --header 'Content-Type: application/json; charset=utf-8' \
  --header 'X-OpenMermaid-Telemetry-Version: 1' \
  --header 'Sec-Fetch-Site: same-origin' \
  --data-binary "@$verify_dir/valid-event.json" \
  "$edge_origin/api/telemetry/v1/template-uses")
assert_status "$edge_status" 204 "Caddy valid event replay"
if [ "$(read_total)" != 1 ]; then
  echo "The edge replay bypassed collector deduplication." >&2
  exit 1
fi

wrong_origin_status=$(request_status "$verify_dir/wrong-origin.body" \
  --request POST \
  --header 'Origin: https://attacker.invalid' \
  --header 'Content-Type: application/json' \
  --header 'X-OpenMermaid-Telemetry-Version: 1' \
  --data-binary "@$verify_dir/valid-event.json" \
  "$edge_origin/api/telemetry/v1/template-uses")
assert_status "$wrong_origin_status" 403 "Wrong-origin event"

gpc_status=$(request_status "$verify_dir/gpc.body" \
  --request POST \
  --header "Origin: $edge_origin" \
  --header 'Content-Type: application/json' \
  --header 'X-OpenMermaid-Telemetry-Version: 1' \
  --header 'Sec-GPC: 1' \
  --data-binary "@$verify_dir/valid-event.json" \
  "$edge_origin/api/telemetry/v1/template-uses")
assert_status "$gpc_status" 403 "GPC event"

wrong_content_status=$(request_status "$verify_dir/wrong-content.body" \
  --request POST \
  --header "Origin: $edge_origin" \
  --header 'Content-Type: text/plain' \
  --header 'X-OpenMermaid-Telemetry-Version: 1' \
  --data-binary "@$verify_dir/valid-event.json" \
  "$edge_origin/api/telemetry/v1/template-uses")
assert_status "$wrong_content_status" 415 "Wrong-content-type event"

wrong_version_status=$(request_status "$verify_dir/wrong-version.body" \
  --request POST \
  --header "Origin: $edge_origin" \
  --header 'Content-Type: application/json' \
  --header 'X-OpenMermaid-Telemetry-Version: 2' \
  --data-binary "@$verify_dir/valid-event.json" \
  "$edge_origin/api/telemetry/v1/template-uses")
assert_status "$wrong_version_status" 415 "Wrong-version event"

printf '{"schemaVersion":1,"events":[]}' >"$verify_dir/empty-batch.json"
empty_batch_status=$(request_status "$verify_dir/empty-batch.body" \
  --request POST \
  --header "Origin: $edge_origin" \
  --header 'Content-Type: application/json' \
  --header 'X-OpenMermaid-Telemetry-Version: 1' \
  --data-binary "@$verify_dir/empty-batch.json" \
  "$edge_origin/api/telemetry/v1/template-uses")
assert_status "$empty_batch_status" 400 "Empty event batch"

node --input-type=module - "$verify_dir/oversized.json" <<'NODE'
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[2], JSON.stringify({ padding: 'x'.repeat(4_100) }));
NODE
oversized_status=$(request_status "$verify_dir/oversized.body" \
  --request POST \
  --header "Origin: $edge_origin" \
  --header 'Content-Type: application/json' \
  --header 'X-OpenMermaid-Telemetry-Version: 1' \
  --data-binary "@$verify_dir/oversized.json" \
  "$edge_origin/api/telemetry/v1/template-uses")
assert_status "$oversized_status" 413 "Oversized event batch"

chunked_oversized_status=$(request_status "$verify_dir/chunked-oversized.body" \
  --http1.1 \
  --request POST \
  --header "Origin: $edge_origin" \
  --header 'Content-Type: application/json' \
  --header 'X-OpenMermaid-Telemetry-Version: 1' \
  --header 'Transfer-Encoding: chunked' \
  --data-binary "@$verify_dir/oversized.json" \
  "$edge_origin/api/telemetry/v1/template-uses")
assert_status "$chunked_oversized_status" 413 "Chunked oversized event batch"

uses_get_status=$(request_status "$verify_dir/uses-get.body" \
  "$edge_origin/api/telemetry/v1/template-uses")
assert_status "$uses_get_status" 405 "GET on event route"

counts_post_status=$(request_status "$verify_dir/counts-post.body" \
  --request POST \
  "$edge_origin/api/telemetry/v1/template-counts")
assert_status "$counts_post_status" 405 "POST on count route"

unknown_status=$(request_status "$verify_dir/unknown.body" \
  "$edge_origin/api/telemetry/v1/not-a-route")
assert_status "$unknown_status" 404 "Unknown telemetry route"

public_collector_health_status=$(request_status "$verify_dir/public-collector-health.body" \
  "$edge_origin/api/telemetry/v1/healthz")
assert_status "$public_collector_health_status" 404 "Public collector health route"

public_metrics_status=$(request_status "$verify_dir/public-metrics.body" \
  "$edge_origin/metrics")
assert_status "$public_metrics_status" 404 "Public collector metrics route"

public_api_metrics_status=$(request_status "$verify_dir/public-api-metrics.body" \
  "$edge_origin/api/telemetry/v1/metrics")
assert_status "$public_api_metrics_status" 404 "Public collector API metrics route"

query_status=$(request_status "$verify_dir/query.body" \
  "$edge_origin/api/telemetry/v1/template-counts?unexpected=1")
assert_status "$query_status" 404 "Count route with query"

echo "Verifying that only prior-day, thresholded totals are published"
node --input-type=module - "$verify_dir" "$catalog_version" <<'NODE'
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , outputDirectory, catalogVersion] = process.argv;
const events = Array.from({ length: 20 }, () => ({
  eventId: randomUUID(),
  kind: 'template_applied',
  templateId: 'sequence-starter',
  catalogVersion,
}));
writeFileSync(
  join(outputDirectory, 'prior-day-a.json'),
  JSON.stringify({ schemaVersion: 1, events: events.slice(0, 16) }),
);
writeFileSync(
  join(outputDirectory, 'prior-day-b.json'),
  JSON.stringify({ schemaVersion: 1, events: events.slice(16) }),
);
NODE

for prior_day_batch in "$verify_dir/prior-day-a.json" "$verify_dir/prior-day-b.json"; do
  prior_day_status=$(request_status "$verify_dir/prior-day.body" \
    --request POST \
    --header "Origin: $edge_origin" \
    --header 'Content-Type: application/json' \
    --header 'X-OpenMermaid-Telemetry-Version: 1' \
    --data-binary "@$prior_day_batch" \
    "$collector_origin/api/telemetry/v1/template-uses")
  assert_status "$prior_day_status" 204 "Prior-day fixture event batch"
done

docker exec "$telemetry_container" node --no-warnings --input-type=module -e \
  "import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync('/data/telemetry.sqlite'); const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10); db.prepare('UPDATE template_usage_daily SET day = ? WHERE catalog_version = ? AND template_id = ?').run(yesterday, '$catalog_version', 'sequence-starter'); db.close();"

curl --fail --silent --show-error \
  --dump-header "$verify_dir/counts.headers" \
  --output "$verify_dir/counts.json" \
  "$edge_origin/api/telemetry/v1/template-counts"
rg --ignore-case --quiet '^Cache-Control: public, max-age=300, stale-while-revalidate=86400\r?$' \
  "$verify_dir/counts.headers"
node --input-type=module - "$verify_dir/counts.json" "$catalog_version" <<'NODE'
import { readFileSync } from 'node:fs';

const payload = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const expectedKeys = ['catalogVersion', 'counts', 'generatedAt', 'schemaVersion'];
const actualKeys = Object.keys(payload).sort();
if (
  JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys) ||
  payload.schemaVersion !== 1 ||
  payload.catalogVersion !== process.argv[3] ||
  typeof payload.generatedAt !== 'string' ||
  !Number.isFinite(Date.parse(payload.generatedAt)) ||
  payload.counts === null ||
  typeof payload.counts !== 'object' ||
  Array.isArray(payload.counts) ||
  payload.counts['sequence-starter'] !== 20 ||
  payload.counts['flowchart-starter'] !== undefined ||
  Object.values(payload.counts).some(
    (count) => !Number.isSafeInteger(count) || count < 20,
  )
) {
  throw new Error('The public count snapshot does not match the bounded aggregate contract.');
}
NODE

docker logs "$caddy_name" >"$verify_dir/caddy-api.log" 2>&1
assert_caddy_log "$verify_dir/caddy-api.log"
docker rm --force "$caddy_name" >/dev/null

echo "Verifying that Caddy minimizes request metadata before proxying"
docker run --detach \
  --name "$probe_name" \
  --network "${compose_project}_default" \
  --network-alias telemetry-header-probe \
  --read-only \
  --user 1000:1000 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 32 \
  --memory 64m \
  --memory-swap 64m \
  --cpus 0.25 \
  "open-mermaid-telemetry:${telemetry_image_tag}" \
  node --no-warnings --input-type=module -e \
  "import { createServer } from 'node:http'; createServer((request, response) => { if (request.url !== '/healthz') console.log(JSON.stringify({ method: request.method, url: request.url, headers: request.headers })); if (request.url === '/healthz') { response.writeHead(200, { 'Content-Type': 'text/plain' }); response.end('ok\\n'); return; } if (request.method === 'GET') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}'); return; } response.writeHead(204); response.end(); }).listen(8091, '0.0.0.0');" >/dev/null

start_caddy telemetry-header-probe:8091
attempt=0
until curl --fail --silent --output /dev/null "$edge_origin/healthz"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "The header-minimization Caddy edge did not become ready." >&2
    exit 1
  fi
  sleep 1
done

probe_post_status=$(request_status "$verify_dir/probe-post.body" \
  --request POST \
  --header "Origin: $edge_origin" \
  --header 'Content-Type: application/json' \
  --header 'X-OpenMermaid-Telemetry-Version: 1' \
  --header 'X-OpenMermaid-Client-IP: 203.0.113.99' \
  --header 'X-Forwarded-For: 203.0.113.99' \
  --header 'X-Forwarded-Host: private.invalid' \
  --header 'X-Forwarded-Proto: ftp' \
  --header 'X-Real-IP: 203.0.113.99' \
  --header 'Forwarded: for=203.0.113.99' \
  --header 'Via: sensitive-proxy' \
  --header 'Authorization: Bearer should-not-pass' \
  --header 'Cookie: should-not-pass=yes' \
  --header 'Referer: https://private.invalid/path?secret=yes' \
  --header 'User-Agent: should-not-pass' \
  --header 'Accept-Language: secret-language' \
  --header 'Sec-CH-UA: should-not-pass' \
  --header 'Sec-Fetch-Dest: document' \
  --header 'Sec-Fetch-Mode: navigate' \
  --header 'Sec-Fetch-User: ?1' \
  --header 'Sec-Fetch-Site: same-origin' \
  --header 'Sec-GPC: 0' \
  --data-binary "@$verify_dir/valid-event.json" \
  "$edge_origin/api/telemetry/v1/template-uses")
assert_status "$probe_post_status" 204 "Header-minimization event probe"

curl --fail --silent --show-error \
  --header 'Origin: https://private.invalid' \
  --header 'X-OpenMermaid-Client-IP: 203.0.113.99' \
  --header 'X-Forwarded-For: 203.0.113.99' \
  --header 'X-Forwarded-Host: private.invalid' \
  --header 'X-Forwarded-Proto: ftp' \
  --header 'Authorization: Bearer should-not-pass' \
  --header 'Cookie: should-not-pass=yes' \
  --header 'Referer: https://private.invalid/' \
  --header 'User-Agent: should-not-pass' \
  --header 'Accept-Language: secret-language' \
  --header 'Sec-CH-UA: should-not-pass' \
  --header 'Sec-Fetch-Site: cross-site' \
  --header 'Sec-GPC: 1' \
  --output "$verify_dir/probe-counts.body" \
  "$edge_origin/api/telemetry/v1/template-counts"

attempt=0
while :; do
  probe_request_count=$(docker logs "$probe_name" 2>/dev/null | \
    rg --count 'api/telemetry/v1/' || true)
  if [ "${probe_request_count:-0}" -ge 2 ]; then
    break
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 20 ]; then
    echo "The header probe did not receive both telemetry requests." >&2
    exit 1
  fi
  sleep 1
done
docker logs "$probe_name" >"$verify_dir/header-probe.log" 2>&1
node --input-type=module - "$verify_dir/header-probe.log" <<'NODE'
import { readFileSync } from 'node:fs';

const requests = readFileSync(process.argv[2], 'utf8')
  .trim()
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const eventRequest = requests.find(
  ({ method, url }) => method === 'POST' && url === '/api/telemetry/v1/template-uses',
);
const countsRequest = requests.find(
  ({ method, url }) => method === 'GET' && url === '/api/telemetry/v1/template-counts',
);
if (eventRequest === undefined || countsRequest === undefined) {
  throw new Error('The metadata-minimization probe did not observe both exact API routes.');
}

const universallyRemoved = [
  'authorization',
  'cookie',
  'referer',
  'user-agent',
  'accept-language',
  'sec-ch-ua',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'forwarded',
  'via',
];
const eventOnlyRemoved = ['sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-user'];
for (const name of [...universallyRemoved, ...eventOnlyRemoved]) {
  if (eventRequest.headers[name] !== undefined) {
    throw new Error(`Caddy forwarded prohibited event metadata: ${name}`);
  }
}
if (
  eventRequest.headers.origin === undefined ||
  eventRequest.headers['content-type'] !== 'application/json' ||
  eventRequest.headers['x-openmermaid-telemetry-version'] !== '1' ||
  eventRequest.headers['sec-fetch-site'] !== 'same-origin' ||
  eventRequest.headers['sec-gpc'] !== '0' ||
  eventRequest.headers['x-openmermaid-client-ip'] === undefined ||
  eventRequest.headers['x-openmermaid-client-ip'] === '203.0.113.99'
) {
  throw new Error('Caddy did not preserve only the collector-required event headers.');
}

for (const name of [
  ...universallyRemoved,
  'origin',
  'sec-fetch-site',
  'sec-gpc',
  'x-openmermaid-client-ip',
]) {
  if (countsRequest.headers[name] !== undefined) {
    throw new Error(`Caddy forwarded prohibited count-request metadata: ${name}`);
  }
}
if (
  Object.keys(countsRequest.headers).some(
    (name) => name.startsWith('sec-ch-') || name.startsWith('sec-fetch-'),
  )
) {
  throw new Error('Caddy forwarded a prohibited client-hint or fetch-metadata count header.');
}
NODE

docker logs "$caddy_name" >"$verify_dir/caddy-probe.log" 2>&1
assert_caddy_log "$verify_dir/caddy-probe.log"

if compose logs telemetry --no-color 2>&1 | rg --ignore-case --quiet \
  '(?:uncaught|unhandled|fatal|\\[(?:alert|crit|emerg|error)\\])'; then
  echo "The telemetry collector emitted an unexpected runtime error." >&2
  compose logs telemetry --no-color >&2
  exit 1
fi

echo "Aggregate telemetry deployment verification passed: browser artifact, CSP, Compose, collector persistence, API boundary, and pinned Caddy edge are healthy."
