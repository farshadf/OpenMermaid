# Aggregate template-use telemetry

Open Mermaid's document editor is client-side and does not need telemetry. The optional aggregate
adapter exists only to publish privacy-coarsened template-use counts in the template catalogue. It
is not a document backend, general analytics product, audience measurement system, attribution
tool, or ad-targeting service.

## Deployment modes

| Build mode                        | Browser behavior                                                                                                 | Runtime requirement                                 | Main CSP                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| `PUBLIC_TELEMETRY_MODE=off`       | No telemetry bootstrap, preference, queue, count request, or event request                                       | Static host only                                    | `connect-src 'none'`                                         |
| `PUBLIC_TELEMETRY_MODE=aggregate` | Counts may load on `/templates/`; reports occur only after explicit opt-in and a successful template application | Static host plus the separate same-origin collector | `'self'` on `/editor/` and `/templates/`; `'none'` elsewhere |

Unset means `off`. Any other value fails the checked release build. The sandboxed renderer always
uses `connect-src 'none'`.

The off artifact is the portable default and remains the correct choice for static providers that
cannot expose the exact same-origin API paths. Do not point the client at a third-party analytics
origin.

## What a report means

A report means:

> A browser that explicitly enabled aggregate sharing successfully applied this catalog template
> through Open Mermaid.

It does **not** mean a unique person, session, account, page view, diagram, export, completed task,
or every use of that template. Retries reuse the same event UUID and are deduplicated. A person may
report several applications, and most visitors may leave reporting disabled.

The catalogue therefore labels a published value as `N+ reported uses`. It never labels it
“users,” “people,” “downloads,” or an exact total.

This intentionally anonymous signal cannot prove that a report came from a person. A non-browser
client can imitate the public schema and Origin header, so the counts are directional product
signals, not audited analytics. Per-client, global, and per-template rate bounds reduce casual
inflation but cannot make an unauthenticated counter fraud-proof.

## Exact browser event

The initial vocabulary has one event kind:

```json
{
  "eventId": "9be47030-3aca-4df9-b8a6-637616500304",
  "kind": "template_applied",
  "templateId": "flowchart-starter",
  "catalogVersion": "11.16.0-v2"
}
```

Events are posted in an exact-key batch:

```json
{
  "schemaVersion": 1,
  "events": []
}
```

The real batch contains 1–16 valid events and is limited to 4 KiB. The collector accepts only
version-4 UUIDs, the one fixed event kind, the current catalog version, and template IDs in its
generated release allowlist. Unknown or extra fields fail closed.

### Data that is never in the schema

- Mermaid source or rendered SVG;
- document title, ID, revision, timestamps, appearance, or local-library state;
- raw path, full URL, query, fragment, shared snapshot, or template catalogue search/filter state;
- account, email, name, stable browser ID, session ID, cookie, or fingerprint;
- referrer, user-agent string, language, locale, time zone, screen or viewport dimensions;
- Web Vitals, performance entries, DOM data, errors, or console output;
- clipboard, file, import, export, or ChatGPT/OpenAI data;
- advertising, campaign, attribution, or revenue data.

The browser request uses `credentials: "omit"` and `referrerPolicy: "no-referrer"`. The retry
timestamp is local queue metadata and is removed from the request.

## Choice and browser storage

Aggregate sharing is off by default. On an aggregate-enabled deployment, the privacy page provides
the control; there is no banner and no backfill.

- Enabling stores only `open-mermaid:aggregate-template-usage:v1=enabled` in local storage.
- The choice affects future successful template applications.
- Disabling removes the preference and clears unsent events.
- A supported `navigator.globalPrivacyControl === true` forces sharing off, removes the preference,
  and clears the queue.
- Clearing Open Mermaid local data also removes the preference and queue.

Failed requests may enter a separate IndexedDB database named `openmermaid-telemetry`, store
`template-use-queue`. It is not part of the document repository. The queue is bounded to 64 records,
16 KiB total, 512 bytes per record, and seven days. Old, malformed, and excess records are pruned.
Delivery failure, IndexedDB failure, CSP rejection, collector downtime, or opting out never changes
the editor result.

## Public count snapshot

The catalogue requests:

```text
GET /api/telemetry/v1/template-counts
```

The response is bounded to 16 KiB and has the following exact shape:

```json
{
  "schemaVersion": 1,
  "catalogVersion": "11.16.0-v2",
  "generatedAt": "2026-07-27T00:00:00.000Z",
  "counts": {
    "flowchart-starter": 100
  }
}
```

The client accepts only the current catalog version, a canonical timestamp no older than 48 hours,
known template IDs, and safe integer lower bounds. Missing, malformed, future-dated, stale,
under-threshold, oversized, or failed responses leave the static recommended order intact and hide
both usage labels and the popularity sort.

Same-day reports are excluded. A report can first appear in a snapshot on a later UTC day.
Templates below 20 accepted prior-day reports are omitted, and published values are rounded down. A
published value of `100` renders as `100+ reported uses`; the unrounded total is never sent to the
catalogue.

## Same-origin API boundary

Caddy exposes exactly two public routes:

```text
POST /api/telemetry/v1/template-uses
GET  /api/telemetry/v1/template-counts
```

The collector's `GET /healthz` remains available only on the loopback upstream. There is no public
catch-all proxy to the collector. The service does not enable CORS, issue cookies, or serve the
application.

The collector also exposes privacy-safe Prometheus text at loopback-only `GET /metrics`. The
supplied Caddy profile does not route it publicly. Metrics contain only fixed status-code counters,
accepted and deduplicated event totals, storage/maintenance error totals, database health, and
SQLite/WAL byte sizes. They contain no template ID, event ID, address, request header, URL, or other
visitor-level label.

The POST endpoint requires the exact canonical origin configured through
`OPEN_MERMAID_TELEMETRY_ORIGIN`, JSON content type, the telemetry version header, an allowed method,
and a bounded body. Caddy and the collector must both reject unexpected paths or methods. Access
logging is disabled in the supplied profile. The public edge still necessarily handles ordinary
network metadata such as an IP address; operators must not add retaining access logs without
updating the privacy review.

## Collector storage and minimization

The collector runs separately on Node 24 using `node:http` and `node:sqlite`; it has no runtime npm
dependency. SQLite is mounted only at `/data`. The static container has no access to that volume,
and the collector has no access to `dist/`, browser storage, document data, credentials, the Docker
socket, or unrelated host paths.

Accepted event UUIDs are SHA-256 hashed for eight-day retry deduplication. The service increments
aggregate template counters immediately and stores no raw event row or request metadata with the
count. Per-day aggregate rows expire after 90 days, generated public snapshots after three days,
and the public response is frozen for one UTC day before a new thresholded snapshot can be
generated. Lifetime aggregate totals remain until the operator deliberately deletes the telemetry
volume; they contain only catalog version, allowlisted template ID, and count.

The POST path has in-memory abuse bounds of 30 requests and 32 events per client address per minute,
300 requests and 240 events globally per minute, and 120 events per template per minute. The
client-address key is secret-hashed in process memory, stops affecting requests after its one-minute
window, is physically swept within the following minute, and is never written to SQLite. These
limits protect one instance; they are not identity or audience metrics.

The expiry lookup is indexed and pruning runs at collector startup and on a six-hour timer, never
in the public count-request hot path. SQLite is capped at 131,072 4-KiB pages (512 MiB), while its
WAL journal is capped at 16 MiB. Operators must alert on sustained rate-limit responses, database
health, and volume growth; hitting the database bound fails writes closed and keeps browser events
queued for retry.

The SQLite schema, retention constants, template allowlist, rate and storage bounds, and publication
function are test contracts. Changing any of them requires a versioned migration, updated privacy
notice, malicious input review, and release evidence.

The supplied Compose profile also bounds the collector to 0.50 CPU, 256 MiB of memory with a
64 MiB reservation and no additional swap, 64 processes, 1,024 open files, and no core dumps.
These are safe starting limits for the deliberately small request and SQLite workload, not a
capacity promise. Operators should load-test their own traffic before changing them and keep the
privacy-preserving application-level rate limits in place.

### Monitoring and backup

Scrape `http://127.0.0.1:8091/metrics` only from the host or a private monitoring network. Alert on
database health `0`, any sustained `429` or `503` response increase, maintenance/storage errors, and
unexpected database or WAL growth. Do not enable request or label logging to obtain those signals.

Never copy only a live `telemetry.sqlite` file while WAL mode is active. Create a consistent backup
with SQLite's online backup API, copy the completed backup out of the dedicated volume, and verify
it before retention:

```bash
docker compose -f compose.yml -f compose.telemetry.yml exec -T telemetry \
  node --input-type=module -e \
  "import {backup,DatabaseSync} from 'node:sqlite';const s=new DatabaseSync('/data/telemetry.sqlite',{readOnly:true});await backup(s,'/data/telemetry-backup.sqlite');s.close()"
docker compose -f compose.yml -f compose.telemetry.yml \
  cp telemetry:/data/telemetry-backup.sqlite ./telemetry-backup.sqlite
node --input-type=module -e \
  "import {DatabaseSync} from 'node:sqlite';const d=new DatabaseSync('./telemetry-backup.sqlite',{readOnly:true});const r=d.prepare('PRAGMA integrity_check').get();if(r.integrity_check!=='ok')process.exit(1);d.close()"
docker compose -f compose.yml -f compose.telemetry.yml exec -T telemetry \
  rm /data/telemetry-backup.sqlite
```

Run a restore rehearsal against a disposable volume before relying on the backup. For an actual
restore, stop the collector, retain a recoverable copy of the existing volume, install the verified
backup as `/data/telemetry.sqlite` with no stale `-wal` or `-shm` companions, restart, and require
healthy `/healthz`, schema-version, prior-day snapshot, and deduplication checks before reconnecting
Caddy.

## Self-hosting

Build a reviewed aggregate artifact with the exact production origin:

```bash
export PUBLIC_SITE_URL=https://openmermaid.example
export PUBLIC_INDEX_SITE=true
export PUBLIC_TELEMETRY_MODE=aggregate
export OPEN_MERMAID_IMAGE_TAG=<reviewed-commit>
export OPEN_MERMAID_TELEMETRY_IMAGE_TAG=<reviewed-commit>
export OPEN_MERMAID_TELEMETRY_ORIGIN=https://openmermaid.example

pnpm build:release
pnpm test:metadata
pnpm test:independence
pnpm test:telemetry-deployment
```

Start the static service and optional overlay:

```bash
docker compose -f compose.yml -f compose.telemetry.yml \
  up --detach --build --wait

curl --fail http://127.0.0.1:8088/healthz
curl --fail http://127.0.0.1:8091/healthz
```

The defaults bind the static service at `127.0.0.1:8088` and collector at
`127.0.0.1:8091`. Install and validate `ops/caddy/openmermaid-telemetry.caddy` instead of the
telemetry-off site snippet. Caddy remains the only public listener.

The collector settings are:

| Variable                               | Required/default         | Purpose                                        |
| -------------------------------------- | ------------------------ | ---------------------------------------------- |
| `OPEN_MERMAID_TELEMETRY_ORIGIN`        | Required                 | Exact canonical HTTPS origin accepted for POST |
| `OPEN_MERMAID_TELEMETRY_BIND_PORT`     | `8091`                   | Loopback host publishing port                  |
| `OPEN_MERMAID_TELEMETRY_PORT`          | `8091`                   | Container listen port                          |
| `OPEN_MERMAID_TELEMETRY_DATABASE_PATH` | `/data/telemetry.sqlite` | Dedicated SQLite path                          |
| `OPEN_MERMAID_TELEMETRY_IMAGE_TAG`     | `local`                  | Operator-selected collector image tag          |
| `OPEN_MERMAID_TELEMETRY_UPSTREAM`      | `127.0.0.1:8091`         | Host-Caddy loopback upstream                   |

Never publish port 8091 on `0.0.0.0`, expose `/healthz` publicly, share the SQLite volume, or add a
fallback route to the collector.

## Verification gates

Both modes are release products and must be tested independently.

`pnpm test:telemetry-deployment` creates an aggregate artifact, validates its profile-bound
manifest, metadata, CSP, and independence contract, then launches disposable hardened static,
collector, and pinned-Caddy containers. It exercises exact methods and paths, origin/GPC/version
rejection, body bounds, event-ID deduplication across collector recreation, SQLite persistence,
loopback publishing, and the container resource/security contract. The temporary verification
volume is deleted on exit. CI additionally runs the aggregate-only browser contract, creates a
collector SBOM, and fails on high-severity collector-image findings.

Telemetry-off assertions:

- no telemetry endpoint string or telemetry storage key in `dist/`;
- no telemetry module requested by `/editor/`, `/templates/`, or `/privacy/`;
- `connect-src 'none'` on every main page and renderer;
- all document/editor/catalogue workflows remain complete.

Aggregate assertions:

- preference off causes zero event POSTs;
- opt-in applies only to future successful, known template applications;
- GPC and opt-out stop sends and clear the queue;
- the network payload has exact keys and no banned data;
- retries reuse an event UUID and increment once;
- invalid origin, method, content type, version, body, UUID, catalog version, slug, and extra fields
  fail closed;
- count thresholding, rounding, timestamp/catalog validation, response-size bounds, and stale-data
  fallback pass;
- collector outage and storage failure never block document creation;
- renderer CSP remains unchanged and malicious Mermaid source causes no telemetry request;
- Docker runs non-root with a read-only root, dropped capabilities, `no-new-privileges`, bounded
  resources/logs, loopback-only publishing, and only the dedicated `/data` volume.

See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY_HEADERS.md](SECURITY_HEADERS.md),
[SELF_HOSTING.md](SELF_HOSTING.md), and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
