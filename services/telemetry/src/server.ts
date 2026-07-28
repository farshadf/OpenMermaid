import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 1;
const DATABASE_SCHEMA_VERSION = 1;
const PUBLICATION_VERSION = 1;
const EVENT_KIND = 'template_applied';
const EVENTS_PATH = '/api/telemetry/v1/template-uses';
const COUNTS_PATH = '/api/telemetry/v1/template-counts';
const HEALTH_PATH = '/healthz';
const METRICS_PATH = '/metrics';
const MAX_REQUEST_BYTES = 4_096;
const MAX_RESPONSE_BYTES = 16_384;
const MAX_BATCH_EVENTS = 16;
const DEDUPE_RETENTION_MS = 8 * 24 * 60 * 60 * 1_000;
const DAILY_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const RATE_LIMIT_PRUNE_INTERVAL_MS = 60_000;
const DISPLAY_BUCKETS = Object.freeze([
  20, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000,
  1_000_000, 2_500_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000, 250_000_000,
  500_000_000, 1_000_000_000,
]);
const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TEMPLATE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const EVENT_KEYS = ['catalogVersion', 'eventId', 'kind', 'templateId'] as const;
const BATCH_KEYS = ['events', 'schemaVersion'] as const;

interface TemplateCatalog {
  readonly catalogVersion: string;
  readonly templateIds: readonly string[];
}

interface TemplateUsageEvent {
  readonly eventId: string;
  readonly kind: typeof EVENT_KIND;
  readonly templateId: string;
  readonly catalogVersion: string;
}

interface TemplateUsageBatch {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly events: readonly TemplateUsageEvent[];
}

export interface CollectorConfig {
  readonly origin: string;
  readonly port: number;
  readonly databasePath: string;
  readonly catalog: TemplateCatalog;
}

interface Environment {
  readonly [key: string]: string | undefined;
  readonly OPEN_MERMAID_TELEMETRY_ORIGIN?: string;
  readonly OPEN_MERMAID_TELEMETRY_PORT?: string;
  readonly OPEN_MERMAID_TELEMETRY_DATABASE_PATH?: string;
  readonly OPEN_MERMAID_TELEMETRY_CATALOG_PATH?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    sortedExpected.every((key, index) => actual[index] === key)
  );
}

function isTemplateIdArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (templateId: unknown) =>
        typeof templateId === 'string' &&
        templateId.length <= 80 &&
        TEMPLATE_ID_PATTERN.test(templateId),
    )
  );
}

function parseCatalog(value: unknown): TemplateCatalog {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['catalogVersion', 'templateIds']) ||
    typeof value.catalogVersion !== 'string' ||
    value.catalogVersion.length === 0 ||
    value.catalogVersion.length > 48 ||
    !isTemplateIdArray(value.templateIds) ||
    value.templateIds.length === 0 ||
    value.templateIds.length > 256 ||
    new Set(value.templateIds).size !== value.templateIds.length
  ) {
    throw new TypeError('The telemetry template catalog is invalid.');
  }
  const maximumSnapshot = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    catalogVersion: value.catalogVersion,
    generatedAt: '9999-12-31T23:59:59.999Z',
    counts: Object.fromEntries(value.templateIds.map((templateId) => [templateId, 1_000_000_000])),
  });
  if (Buffer.byteLength(maximumSnapshot, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new TypeError('The telemetry template catalog exceeds the public response-size limit.');
  }
  return {
    catalogVersion: value.catalogVersion,
    templateIds: Object.freeze([...value.templateIds]),
  };
}

function parseOrigin(value: string | undefined): string {
  if (value === undefined) {
    throw new TypeError('OPEN_MERMAID_TELEMETRY_ORIGIN is required.');
  }
  const parsed = new URL(value);
  const localDevelopment =
    parsed.protocol === 'http:' &&
    (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
  if (
    (parsed.protocol !== 'https:' && !localDevelopment) ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new TypeError(
      'OPEN_MERMAID_TELEMETRY_ORIGIN must be an HTTPS origin (or loopback HTTP for tests).',
    );
  }
  return parsed.origin;
}

function parsePort(value: string | undefined): number {
  const port = value === undefined ? 8091 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError('OPEN_MERMAID_TELEMETRY_PORT must be an integer from 1 to 65535.');
  }
  return port;
}

export function loadCollectorConfig(
  environment: Environment = process.env,
  defaultCatalogPath = fileURLToPath(new URL('../catalog.json', import.meta.url)),
): CollectorConfig {
  const catalogPath = environment.OPEN_MERMAID_TELEMETRY_CATALOG_PATH ?? defaultCatalogPath;
  const catalog: unknown = JSON.parse(readFileSync(catalogPath, 'utf8'));
  return {
    origin: parseOrigin(environment.OPEN_MERMAID_TELEMETRY_ORIGIN),
    port: parsePort(environment.OPEN_MERMAID_TELEMETRY_PORT),
    databasePath: environment.OPEN_MERMAID_TELEMETRY_DATABASE_PATH ?? '/data/telemetry.sqlite',
    catalog: parseCatalog(catalog),
  };
}

function isTemplateUsageEvent(
  value: unknown,
  catalog: TemplateCatalog,
  allowedTemplateIds: ReadonlySet<string>,
): value is TemplateUsageEvent {
  if (!isRecord(value) || !hasExactKeys(value, EVENT_KEYS)) return false;
  return (
    typeof value.eventId === 'string' &&
    EVENT_ID_PATTERN.test(value.eventId) &&
    value.kind === EVENT_KIND &&
    typeof value.templateId === 'string' &&
    allowedTemplateIds.has(value.templateId) &&
    value.catalogVersion === catalog.catalogVersion
  );
}

function parseBatch(value: unknown, catalog: TemplateCatalog): TemplateUsageBatch {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, BATCH_KEYS) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(value.events) ||
    value.events.length === 0 ||
    value.events.length > MAX_BATCH_EVENTS
  ) {
    throw new TypeError('Invalid template usage batch.');
  }
  const allowedTemplateIds = new Set(catalog.templateIds);
  if (!value.events.every((event) => isTemplateUsageEvent(event, catalog, allowedTemplateIds))) {
    throw new TypeError('Invalid template usage event.');
  }
  return { schemaVersion: SCHEMA_VERSION, events: value.events };
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function displayLowerBound(count: number): number | undefined {
  let lowerBound: number | undefined;
  for (const bucket of DISPLAY_BUCKETS) {
    if (bucket > count) break;
    lowerBound = bucket;
  }
  return lowerBound;
}

export class TelemetryDatabase {
  readonly #database: DatabaseSync;
  readonly #catalog: TemplateCatalog;
  readonly #path: string;
  #snapshotCache: { day: string; payload: string } | undefined;
  #writeHealthy = true;
  #closed = false;

  constructor(path: string, catalog: TemplateCatalog) {
    this.#catalog = catalog;
    this.#path = path;
    this.#database = new DatabaseSync(path, {
      allowExtension: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
    this.#database.exec(`
      PRAGMA page_size = 4096;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = MEMORY;
      PRAGMA trusted_schema = OFF;
      PRAGMA journal_size_limit = 16777216;
      PRAGMA wal_autocheckpoint = 1000;
      PRAGMA max_page_count = 131072;
    `);

    const versionRow = this.#database.prepare('PRAGMA user_version').get() as
      { user_version?: unknown } | undefined;
    const version = versionRow?.user_version;
    if (typeof version !== 'number' || !Number.isInteger(version)) {
      this.#database.close();
      throw new Error('Unable to read the telemetry database schema version.');
    }
    if (version > DATABASE_SCHEMA_VERSION) {
      this.#database.close();
      throw new Error(
        `Telemetry database schema ${String(version)} is newer than supported schema ${String(DATABASE_SCHEMA_VERSION)}.`,
      );
    }
    if (version === 0) {
      this.#database.exec('BEGIN IMMEDIATE');
      try {
        this.#database.exec(`
          CREATE TABLE IF NOT EXISTS received_events (
            event_hash TEXT PRIMARY KEY,
            expires_at INTEGER NOT NULL
          ) STRICT, WITHOUT ROWID;
          CREATE INDEX IF NOT EXISTS received_events_expiry
            ON received_events (expires_at);

          CREATE TABLE IF NOT EXISTS template_usage_daily (
            day TEXT NOT NULL,
            catalog_version TEXT NOT NULL,
            template_id TEXT NOT NULL,
            count INTEGER NOT NULL CHECK (count > 0),
            PRIMARY KEY (day, catalog_version, template_id)
          ) STRICT, WITHOUT ROWID;

          CREATE TABLE IF NOT EXISTS template_usage_totals (
            catalog_version TEXT NOT NULL,
            template_id TEXT NOT NULL,
            count INTEGER NOT NULL CHECK (count > 0),
            PRIMARY KEY (catalog_version, template_id)
          ) STRICT, WITHOUT ROWID;

          DROP TABLE IF EXISTS public_snapshots;
          CREATE TABLE public_snapshots (
            day TEXT NOT NULL,
            catalog_version TEXT NOT NULL,
            publication_version INTEGER NOT NULL,
            generated_at TEXT NOT NULL,
            payload TEXT NOT NULL,
            PRIMARY KEY (day, catalog_version, publication_version)
          ) STRICT, WITHOUT ROWID;

          PRAGMA user_version = 1;
          COMMIT;
        `);
      } catch (error) {
        try {
          this.#database.exec('ROLLBACK');
        } catch {
          // Preserve the migration error.
        }
        this.#database.close();
        throw error;
      }
    }
  }

  record(events: readonly TemplateUsageEvent[], now = Date.now()): number {
    const day = utcDay(now);
    const eventExpiry = now + DEDUPE_RETENTION_MS;
    let accepted = 0;

    this.#database.exec('BEGIN IMMEDIATE');
    try {
      const insertDedupe = this.#database.prepare(
        `INSERT INTO received_events (event_hash, expires_at)
         VALUES (?, ?)
         ON CONFLICT (event_hash) DO UPDATE SET expires_at = excluded.expires_at
         WHERE received_events.expires_at <= ?`,
      );
      const updateDaily = this.#database.prepare(`
        INSERT INTO template_usage_daily (day, catalog_version, template_id, count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT (day, catalog_version, template_id)
        DO UPDATE SET count = count + 1
      `);
      const updateTotal = this.#database.prepare(`
        INSERT INTO template_usage_totals (catalog_version, template_id, count)
        VALUES (?, ?, 1)
        ON CONFLICT (catalog_version, template_id)
        DO UPDATE SET count = count + 1
      `);

      for (const event of events) {
        const hash = createHash('sha256').update(event.eventId, 'utf8').digest('hex');
        const inserted = insertDedupe.run(hash, eventExpiry, now);
        if (Number(inserted.changes) !== 1) continue;
        updateDaily.run(day, event.catalogVersion, event.templateId);
        updateTotal.run(event.catalogVersion, event.templateId);
        accepted += 1;
      }
      this.#database.exec('COMMIT');
      this.#writeHealthy = true;
      return accepted;
    } catch (error) {
      this.#writeHealthy = false;
      try {
        this.#database.exec('ROLLBACK');
      } catch {
        // Preserve the original write failure while keeping health failed closed.
      }
      throw error;
    }
  }

  publicSnapshot(now = Date.now()): string {
    const day = utcDay(now);
    if (this.#snapshotCache?.day === day) return this.#snapshotCache.payload;

    const existing = this.#database
      .prepare(
        `SELECT payload
         FROM public_snapshots
         WHERE day = ? AND catalog_version = ? AND publication_version = ?`,
      )
      .get(day, this.#catalog.catalogVersion, PUBLICATION_VERSION) as
      { payload?: unknown } | undefined;
    if (typeof existing?.payload === 'string') {
      this.#snapshotCache = { day, payload: existing.payload };
      return existing.payload;
    }

    const counts: Record<string, number> = {};
    const rows = this.#database
      .prepare(
        `SELECT totals.template_id,
                totals.count - COALESCE(today.count, 0) AS count
         FROM template_usage_totals AS totals
         LEFT JOIN template_usage_daily AS today
           ON today.day = ?
          AND today.catalog_version = totals.catalog_version
          AND today.template_id = totals.template_id
         WHERE totals.catalog_version = ?
         ORDER BY totals.template_id`,
      )
      .all(day, this.#catalog.catalogVersion) as {
      template_id?: unknown;
      count?: unknown;
    }[];
    for (const row of rows) {
      if (typeof row.template_id !== 'string' || typeof row.count !== 'number') continue;
      const lowerBound = displayLowerBound(row.count);
      if (lowerBound !== undefined) counts[row.template_id] = lowerBound;
    }

    const generatedAt = new Date(now).toISOString();
    const payload = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      catalogVersion: this.#catalog.catalogVersion,
      generatedAt,
      counts,
    });
    if (Buffer.byteLength(payload, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new Error('Public telemetry snapshot exceeds the response-size contract.');
    }
    try {
      this.#database
        .prepare(
          `INSERT OR REPLACE INTO public_snapshots
             (day, catalog_version, publication_version, generated_at, payload)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(day, this.#catalog.catalogVersion, PUBLICATION_VERSION, generatedAt, payload);
    } catch (error) {
      this.#writeHealthy = false;
      throw error;
    }
    this.#snapshotCache = { day, payload };
    this.#writeHealthy = true;
    return payload;
  }

  healthy(): boolean {
    if (this.#closed) return false;
    try {
      if (!this.#writeHealthy) this.prune();
      const version = this.#database.prepare('PRAGMA user_version').get() as
        { user_version?: unknown } | undefined;
      if (version?.user_version !== DATABASE_SCHEMA_VERSION) return false;
      this.#database.prepare('SELECT event_hash FROM received_events LIMIT 0').all();
      this.#database.prepare('SELECT day FROM template_usage_daily LIMIT 0').all();
      this.#database.prepare('SELECT template_id FROM template_usage_totals LIMIT 0').all();
      this.#database.prepare('SELECT day FROM public_snapshots LIMIT 0').all();
      return true;
    } catch {
      return false;
    }
  }

  storageUsage(): { databaseBytes: number; walBytes: number } {
    if (this.#path === ':memory:') return { databaseBytes: 0, walBytes: 0 };
    const fileBytes = (path: string): number => {
      try {
        return statSync(path).size;
      } catch {
        return 0;
      }
    };
    return {
      databaseBytes: fileBytes(this.#path),
      walBytes: fileBytes(`${this.#path}-wal`),
    };
  }

  prune(now = Date.now()): void {
    this.#database.exec('BEGIN IMMEDIATE');
    try {
      this.#pruneStatements(now, utcDay(now - DAILY_RETENTION_MS));
      this.#database.exec('COMMIT');
      this.#writeHealthy = true;
    } catch (error) {
      this.#writeHealthy = false;
      try {
        this.#database.exec('ROLLBACK');
      } catch {
        // Preserve the original cleanup failure while keeping health failed closed.
      }
      throw error;
    }
  }

  #pruneStatements(now: number, dailyCutoff: string): void {
    this.#database.prepare('DELETE FROM received_events WHERE expires_at <= ?').run(now);
    this.#database.prepare('DELETE FROM template_usage_daily WHERE day < ?').run(dailyCutoff);
    this.#database
      .prepare('DELETE FROM public_snapshots WHERE day < ?')
      .run(utcDay(now - 3 * 24 * 60 * 60 * 1_000));
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#database.close();
  }
}

interface RateLimitEntry {
  count: number;
  windowStartedAt: number;
}

class MemoryRateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #secret = randomBytes(32);
  readonly #entries = new Map<string, RateLimitEntry>();

  constructor(limit: number, windowMs: number) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  accept(value: string, cost = 1, now = Date.now()): boolean {
    const key = createHash('sha256').update(this.#secret).update(value, 'utf8').digest('hex');
    const existing = this.#entries.get(key);
    if (existing === undefined || now - existing.windowStartedAt >= this.#windowMs) {
      this.#entries.set(key, { count: cost, windowStartedAt: now });
      if (cost > this.#limit) return false;
    } else {
      existing.count += cost;
      if (existing.count > this.#limit) return false;
    }

    return true;
  }

  prune(now = Date.now()): void {
    for (const [entryKey, entry] of this.#entries) {
      if (now - entry.windowStartedAt >= this.#windowMs) this.#entries.delete(entryKey);
    }
  }
}

class RequestTooLargeError extends Error {}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestHasBody(request: IncomingMessage): boolean {
  const transferEncoding = header(request, 'transfer-encoding');
  if (transferEncoding !== undefined) return true;
  const contentLength = header(request, 'content-length');
  if (contentLength === undefined) return false;
  return !/^(?:0|00*)$/u.test(contentLength.trim());
}

function send(
  response: ServerResponse,
  status: number,
  body = '',
  headers: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  response.end(body);
}

async function readBoundedBody(request: IncomingMessage): Promise<string> {
  const declaredLength = Number(header(request, 'content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new RequestTooLargeError();
  }

  return await new Promise<string>((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;

    const cleanup = (): void => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
    };
    const rejectOnce = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectBody(error);
    };
    const onData = (chunk: Buffer): void => {
      bytes += chunk.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        // Stop reading immediately. The caller responds with Connection: close, so a
        // chunked sender cannot make the collector drain an unbounded request first.
        request.pause();
        rejectOnce(new RequestTooLargeError());
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveBody(Buffer.concat(chunks).toString('utf8'));
    };
    const onError = (error: Error): void => rejectOnce(error);
    const onAborted = (): void => rejectOnce(new Error('Request aborted.'));

    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', onError);
    request.on('aborted', onAborted);
  });
}

export class TelemetryCollector {
  readonly #config: CollectorConfig;
  readonly #database: TelemetryDatabase;
  readonly #server: Server;
  readonly #clientRequestRateLimit = new MemoryRateLimiter(30, 60_000);
  readonly #globalRequestRateLimit = new MemoryRateLimiter(300, 60_000);
  readonly #clientEventRateLimit = new MemoryRateLimiter(32, 60_000);
  readonly #globalEventRateLimit = new MemoryRateLimiter(240, 60_000);
  readonly #templateEventRateLimit = new MemoryRateLimiter(120, 60_000);
  readonly #countsRequestRateLimit = new MemoryRateLimiter(1_200, 60_000);
  readonly #pruneTimer: ReturnType<typeof setInterval>;
  readonly #rateLimitPruneTimer: ReturnType<typeof setInterval>;
  readonly #responseCounts = new Map<number, number>();
  #requestCount = 0;
  #acceptedEventCount = 0;
  #deduplicatedEventCount = 0;
  #storageErrorCount = 0;
  #maintenanceErrorCount = 0;
  #lastHealthState: boolean | undefined;
  #closePromise: Promise<void> | undefined;

  constructor(config: CollectorConfig) {
    this.#config = config;
    this.#database = new TelemetryDatabase(config.databasePath, config.catalog);
    this.#database.prune();
    this.#server = createServer((request, response) => {
      this.#requestCount += 1;
      response.once('finish', () => {
        this.#responseCounts.set(
          response.statusCode,
          (this.#responseCounts.get(response.statusCode) ?? 0) + 1,
        );
      });
      void this.#handle(request, response).catch(() => {
        this.#storageErrorCount += 1;
        if (!response.headersSent) {
          send(response, 500, '', { 'Cache-Control': 'no-store' });
        } else {
          response.end();
        }
      });
    });
    this.#server.requestTimeout = 5_000;
    this.#server.headersTimeout = 5_000;
    this.#server.keepAliveTimeout = 5_000;
    this.#server.maxHeadersCount = 32;
    this.#pruneTimer = setInterval(() => {
      try {
        this.#database.prune();
      } catch {
        this.#maintenanceErrorCount += 1;
        // Cleanup is retried; the collector continues to fail closed per request.
      }
    }, PRUNE_INTERVAL_MS);
    this.#pruneTimer.unref();
    this.#rateLimitPruneTimer = setInterval(() => {
      this.#clientRequestRateLimit.prune();
      this.#globalRequestRateLimit.prune();
      this.#clientEventRateLimit.prune();
      this.#globalEventRateLimit.prune();
      this.#templateEventRateLimit.prune();
      this.#countsRequestRateLimit.prune();
    }, RATE_LIMIT_PRUNE_INTERVAL_MS);
    this.#rateLimitPruneTimer.unref();
  }

  get server(): Server {
    return this.#server;
  }

  #observeHealth(healthy: boolean): void {
    if (this.#lastHealthState === healthy) return;
    if (this.#lastHealthState !== undefined) {
      const state = healthy ? 'recovered' : 'unhealthy';
      console.warn(`Open Mermaid telemetry database health changed: ${state}.`);
    }
    this.#lastHealthState = healthy;
  }

  #renderMetrics(): string {
    const healthy = this.#database.healthy();
    this.#observeHealth(healthy);
    const { databaseBytes, walBytes } = this.#database.storageUsage();
    const responseClassLines = [2, 3, 4, 5].map((statusClass) => {
      let count = 0;
      for (const [status, statusCount] of this.#responseCounts) {
        if (Math.floor(status / 100) === statusClass) count += statusCount;
      }
      return `openmermaid_telemetry_http_responses_total{class="${String(statusClass)}xx"} ${String(count)}`;
    });
    const responseCodeLines = [204, 400, 403, 404, 405, 413, 415, 429, 500, 503].map(
      (status) =>
        `openmermaid_telemetry_http_response_codes_total{code="${String(status)}"} ${String(this.#responseCounts.get(status) ?? 0)}`,
    );
    return [
      '# HELP openmermaid_telemetry_http_requests_total Collector HTTP requests.',
      '# TYPE openmermaid_telemetry_http_requests_total counter',
      `openmermaid_telemetry_http_requests_total ${String(this.#requestCount)}`,
      '# HELP openmermaid_telemetry_http_responses_total Collector responses by status class.',
      '# TYPE openmermaid_telemetry_http_responses_total counter',
      ...responseClassLines,
      '# HELP openmermaid_telemetry_http_response_codes_total Collector responses for actionable status codes.',
      '# TYPE openmermaid_telemetry_http_response_codes_total counter',
      ...responseCodeLines,
      '# HELP openmermaid_telemetry_events_accepted_total Events added to aggregate counts.',
      '# TYPE openmermaid_telemetry_events_accepted_total counter',
      `openmermaid_telemetry_events_accepted_total ${String(this.#acceptedEventCount)}`,
      '# HELP openmermaid_telemetry_events_deduplicated_total Retry events ignored by UUID hash.',
      '# TYPE openmermaid_telemetry_events_deduplicated_total counter',
      `openmermaid_telemetry_events_deduplicated_total ${String(this.#deduplicatedEventCount)}`,
      '# HELP openmermaid_telemetry_storage_errors_total Storage operation failures.',
      '# TYPE openmermaid_telemetry_storage_errors_total counter',
      `openmermaid_telemetry_storage_errors_total ${String(this.#storageErrorCount)}`,
      '# HELP openmermaid_telemetry_maintenance_errors_total Scheduled maintenance failures.',
      '# TYPE openmermaid_telemetry_maintenance_errors_total counter',
      `openmermaid_telemetry_maintenance_errors_total ${String(this.#maintenanceErrorCount)}`,
      '# HELP openmermaid_telemetry_database_healthy Database read and write readiness.',
      '# TYPE openmermaid_telemetry_database_healthy gauge',
      `openmermaid_telemetry_database_healthy ${healthy ? '1' : '0'}`,
      '# HELP openmermaid_telemetry_database_bytes SQLite main database file size.',
      '# TYPE openmermaid_telemetry_database_bytes gauge',
      `openmermaid_telemetry_database_bytes ${String(databaseBytes)}`,
      '# HELP openmermaid_telemetry_wal_bytes SQLite write-ahead log file size.',
      '# TYPE openmermaid_telemetry_wal_bytes gauge',
      `openmermaid_telemetry_wal_bytes ${String(walBytes)}`,
      '',
    ].join('\n');
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', 'http://collector.invalid');
    if (requestUrl.search !== '' || requestUrl.hash !== '') {
      send(response, 404, '', { 'Cache-Control': 'no-store' });
      return;
    }

    if (requestUrl.pathname === HEALTH_PATH) {
      if (request.method !== 'GET') {
        send(response, 405, '', { Allow: 'GET', 'Cache-Control': 'no-store' });
        return;
      }
      const healthy = this.#database.healthy();
      this.#observeHealth(healthy);
      send(response, healthy ? 200 : 503, healthy ? 'ok\n' : 'unavailable\n', {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      return;
    }

    if (requestUrl.pathname === METRICS_PATH) {
      if (request.method !== 'GET') {
        send(response, 405, '', { Allow: 'GET', 'Cache-Control': 'no-store' });
        return;
      }
      if (requestHasBody(request)) {
        response.shouldKeepAlive = false;
        send(response, 400, '', {
          'Cache-Control': 'no-store',
          Connection: 'close',
        });
        return;
      }
      send(response, 200, this.#renderMetrics(), {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      });
      return;
    }

    if (requestUrl.pathname === COUNTS_PATH) {
      if (request.method !== 'GET') {
        send(response, 405, '', { Allow: 'GET', 'Cache-Control': 'no-store' });
        return;
      }
      if (requestHasBody(request)) {
        response.shouldKeepAlive = false;
        send(response, 400, '', {
          'Cache-Control': 'no-store',
          Connection: 'close',
        });
        return;
      }
      if (!this.#countsRequestRateLimit.accept('global')) {
        send(response, 429, '', {
          'Cache-Control': 'no-store',
          'Retry-After': '60',
        });
        return;
      }
      const payload = this.#database.publicSnapshot();
      send(response, 200, payload, {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
        'Content-Type': 'application/json; charset=utf-8',
      });
      return;
    }

    if (requestUrl.pathname !== EVENTS_PATH) {
      send(response, 404, '', { 'Cache-Control': 'no-store' });
      return;
    }
    if (request.method !== 'POST') {
      send(response, 405, '', { Allow: 'POST', 'Cache-Control': 'no-store' });
      return;
    }
    if (
      header(request, 'origin') !== this.#config.origin ||
      header(request, 'sec-gpc') === '1' ||
      (header(request, 'sec-fetch-site') !== undefined &&
        header(request, 'sec-fetch-site') !== 'same-origin')
    ) {
      send(response, 403, '', { 'Cache-Control': 'no-store' });
      return;
    }
    if (
      header(request, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
        'application/json' ||
      header(request, 'x-openmermaid-telemetry-version') !== '1'
    ) {
      send(response, 415, '', { 'Cache-Control': 'no-store' });
      return;
    }

    const clientAddress =
      header(request, 'x-openmermaid-client-ip') ?? request.socket.remoteAddress ?? 'unknown';
    if (
      !this.#globalRequestRateLimit.accept('global') ||
      !this.#clientRequestRateLimit.accept(clientAddress)
    ) {
      send(response, 429, '', {
        'Cache-Control': 'no-store',
        'Retry-After': '60',
      });
      return;
    }

    let body: string;
    try {
      body = await readBoundedBody(request);
    } catch (error) {
      const requestTooLarge = error instanceof RequestTooLargeError;
      if (requestTooLarge) response.shouldKeepAlive = false;
      send(response, requestTooLarge ? 413 : 400, '', {
        'Cache-Control': 'no-store',
        ...(requestTooLarge ? { Connection: 'close' } : {}),
      });
      return;
    }

    let batch: TemplateUsageBatch;
    try {
      const value: unknown = JSON.parse(body);
      batch = parseBatch(value, this.#config.catalog);
    } catch {
      send(response, 400, '', { 'Cache-Control': 'no-store' });
      return;
    }

    if (
      !this.#globalEventRateLimit.accept('global', batch.events.length) ||
      !this.#clientEventRateLimit.accept(clientAddress, batch.events.length)
    ) {
      send(response, 429, '', {
        'Cache-Control': 'no-store',
        'Retry-After': '60',
      });
      return;
    }
    const templateEventCounts = new Map<string, number>();
    for (const event of batch.events) {
      templateEventCounts.set(
        event.templateId,
        (templateEventCounts.get(event.templateId) ?? 0) + 1,
      );
    }
    for (const [templateId, count] of templateEventCounts) {
      if (!this.#templateEventRateLimit.accept(templateId, count)) {
        send(response, 429, '', {
          'Cache-Control': 'no-store',
          'Retry-After': '60',
        });
        return;
      }
    }

    try {
      const accepted = this.#database.record(batch.events);
      this.#acceptedEventCount += accepted;
      this.#deduplicatedEventCount += batch.events.length - accepted;
      send(response, 204, '', { 'Cache-Control': 'no-store' });
    } catch {
      this.#storageErrorCount += 1;
      send(response, 503, '', {
        'Cache-Control': 'no-store',
        'Retry-After': '60',
      });
    }
  }

  async listen(port = this.#config.port, host = '0.0.0.0'): Promise<number> {
    await new Promise<void>((resolveListen, rejectListen) => {
      const onError = (error: Error): void => rejectListen(error);
      this.#server.once('error', onError);
      this.#server.listen(port, host, () => {
        this.#server.off('error', onError);
        resolveListen();
      });
    });
    const address = this.#server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Telemetry collector did not bind a TCP port.');
    }
    return address.port;
  }

  async close(): Promise<void> {
    this.#closePromise ??= (async () => {
      clearInterval(this.#pruneTimer);
      clearInterval(this.#rateLimitPruneTimer);
      if (this.#server.listening) {
        await new Promise<void>((resolveClose, rejectClose) => {
          this.#server.close((error) => {
            if (error === undefined) resolveClose();
            else rejectClose(error);
          });
        });
      }
      this.#database.close();
    })();
    await this.#closePromise;
  }
}

async function startFromEnvironment(): Promise<void> {
  const config = loadCollectorConfig();
  const collector = new TelemetryCollector(config);
  await collector.listen();
  console.log(`Open Mermaid telemetry collector listening on port ${String(config.port)}.`);

  const shutdown = (): void => {
    void collector
      .close()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const entrypoint = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (entrypoint === fileURLToPath(import.meta.url)) {
  await startFromEnvironment();
}
