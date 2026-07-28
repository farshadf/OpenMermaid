import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TelemetryCollector,
  TelemetryDatabase,
  loadCollectorConfig,
  type CollectorConfig,
} from '../../../services/telemetry/src/server';

const catalog = {
  catalogVersion: '11.16.0-v2',
  templateIds: ['flowchart-starter', 'sequence-starter'],
} as const;
const origin = 'https://openmermaid.example';

function usageEvent(index: number, templateId = 'flowchart-starter') {
  return {
    eventId: `018f6d4e-8d4e-4d3b-8d4e-${index.toString(16).padStart(12, '0')}`,
    kind: 'template_applied' as const,
    templateId,
    catalogVersion: catalog.catalogVersion,
  };
}

function temporaryDatabase(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'openmermaid-telemetry-'));
  return { directory, path: join(directory, 'telemetry.sqlite') };
}

describe('telemetry aggregate database', () => {
  it('deduplicates retries, publishes only delayed thresholded lower bounds, and stores no raw ID', () => {
    const temporary = temporaryDatabase();
    const database = new TelemetryDatabase(temporary.path, catalog);
    const firstDay = Date.parse('2026-07-27T12:00:00.000Z');
    try {
      const firstTwenty = Array.from({ length: 20 }, (_, index) => usageEvent(index + 1));
      const firstEvent = firstTwenty[0];
      expect(firstEvent).toBeDefined();
      if (firstEvent === undefined) throw new Error('Fixture is missing its first event.');
      expect(database.record(firstTwenty, firstDay)).toBe(20);
      expect(database.record([firstEvent], firstDay)).toBe(0);
      expect(JSON.parse(database.publicSnapshot(firstDay))).toMatchObject({
        counts: {},
      });

      const later = Array.from({ length: 30 }, (_, index) => usageEvent(index + 100));
      expect(database.record(later, firstDay + 60_000)).toBe(30);
      expect(JSON.parse(database.publicSnapshot(firstDay + 60_000))).toMatchObject({
        counts: {},
      });
      expect(JSON.parse(database.publicSnapshot(firstDay + 24 * 60 * 60 * 1_000))).toMatchObject({
        counts: { 'flowchart-starter': 50 },
      });
    } finally {
      database.close();
      expect(() => database.close()).not.toThrow();
    }

    const inspection = new DatabaseSync(temporary.path, { readOnly: true });
    try {
      const rows = inspection.prepare('SELECT event_hash FROM received_events').all() as {
        event_hash: string;
      }[];
      expect(rows).toHaveLength(50);
      expect(rows.every(({ event_hash }) => /^[0-9a-f]{64}$/u.test(event_hash))).toBe(true);
      expect(readFileSync(temporary.path).includes(Buffer.from(firstTwentyId()))).toBe(false);
    } finally {
      inspection.close();
      rmSync(temporary.directory, { recursive: true, force: true });
    }
  });

  it('expires dedupe hashes after eight days and prunes daily rows after 90 days', () => {
    const temporary = temporaryDatabase();
    const database = new TelemetryDatabase(temporary.path, catalog);
    const oldDay = Date.parse('2026-01-01T12:00:00.000Z');
    const currentDay = oldDay + 100 * 24 * 60 * 60 * 1_000;
    const repeated = usageEvent(900);
    try {
      expect(database.record([repeated], oldDay)).toBe(1);
      expect(database.record([repeated], currentDay)).toBe(1);
      database.prune(currentDay);
    } finally {
      database.close();
    }

    const inspection = new DatabaseSync(temporary.path, { readOnly: true });
    try {
      const daily = inspection
        .prepare('SELECT day, count FROM template_usage_daily ORDER BY day')
        .all() as { day: string; count: number }[];
      const total = inspection
        .prepare('SELECT count FROM template_usage_totals WHERE template_id = ?')
        .get(repeated.templateId) as { count: number };
      expect(daily).toEqual([{ day: '2026-04-11', count: 1 }]);
      expect(total.count).toBe(2);
    } finally {
      inspection.close();
      rmSync(temporary.directory, { recursive: true, force: true });
    }
  });

  it('keys same-day public snapshots by catalog and publication contract', () => {
    const temporary = temporaryDatabase();
    const firstDay = Date.parse('2026-07-27T12:00:00.000Z');
    const snapshotDay = firstDay + 24 * 60 * 60 * 1_000;
    const firstDatabase = new TelemetryDatabase(temporary.path, catalog);
    try {
      expect(
        firstDatabase.record(
          Array.from({ length: 20 }, (_, index) => usageEvent(index + 1)),
          firstDay,
        ),
      ).toBe(20);
      expect(JSON.parse(firstDatabase.publicSnapshot(snapshotDay))).toMatchObject({
        catalogVersion: catalog.catalogVersion,
        counts: { 'flowchart-starter': 20 },
      });
    } finally {
      firstDatabase.close();
    }

    const nextCatalog = {
      catalogVersion: '11.17.0-v1',
      templateIds: catalog.templateIds,
    } as const;
    const nextDatabase = new TelemetryDatabase(temporary.path, nextCatalog);
    try {
      const events = Array.from({ length: 20 }, (_, index) => ({
        ...usageEvent(index + 100),
        catalogVersion: nextCatalog.catalogVersion,
      }));
      expect(nextDatabase.record(events, firstDay)).toBe(20);
      expect(JSON.parse(nextDatabase.publicSnapshot(snapshotDay))).toMatchObject({
        catalogVersion: nextCatalog.catalogVersion,
        counts: { 'flowchart-starter': 20 },
      });
    } finally {
      nextDatabase.close();
      rmSync(temporary.directory, { recursive: true, force: true });
    }
  });

  it('migrates the unversioned pre-release snapshot table without losing aggregate totals', () => {
    const temporary = temporaryDatabase();
    const legacy = new DatabaseSync(temporary.path);
    legacy.exec(`
      CREATE TABLE received_events (
        event_hash TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      ) STRICT, WITHOUT ROWID;
      CREATE TABLE template_usage_daily (
        day TEXT NOT NULL,
        catalog_version TEXT NOT NULL,
        template_id TEXT NOT NULL,
        count INTEGER NOT NULL CHECK (count > 0),
        PRIMARY KEY (day, catalog_version, template_id)
      ) STRICT, WITHOUT ROWID;
      CREATE TABLE template_usage_totals (
        catalog_version TEXT NOT NULL,
        template_id TEXT NOT NULL,
        count INTEGER NOT NULL CHECK (count > 0),
        PRIMARY KEY (catalog_version, template_id)
      ) STRICT, WITHOUT ROWID;
      CREATE TABLE public_snapshots (
        day TEXT PRIMARY KEY,
        generated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      ) STRICT, WITHOUT ROWID;
      INSERT INTO template_usage_totals (catalog_version, template_id, count)
      VALUES ('11.16.0-v2', 'flowchart-starter', 20);
      INSERT INTO public_snapshots (day, generated_at, payload)
      VALUES ('2026-07-28', '2026-07-28T00:00:00.000Z', '{}');
    `);
    legacy.close();

    const migrated = new TelemetryDatabase(temporary.path, catalog);
    migrated.close();
    const inspection = new DatabaseSync(temporary.path, { readOnly: true });
    try {
      const version = inspection.prepare('PRAGMA user_version').get() as {
        user_version: number;
      };
      const total = inspection
        .prepare('SELECT count FROM template_usage_totals WHERE template_id = ?')
        .get('flowchart-starter') as { count: number };
      const columns = inspection.prepare('PRAGMA table_info(public_snapshots)').all() as {
        name: string;
      }[];
      expect(version.user_version).toBe(1);
      expect(total.count).toBe(20);
      expect(columns.map(({ name }) => name)).toEqual([
        'day',
        'catalog_version',
        'publication_version',
        'generated_at',
        'payload',
      ]);
    } finally {
      inspection.close();
      rmSync(temporary.directory, { recursive: true, force: true });
    }
  });

  it('refuses a database schema created by a newer collector', () => {
    const temporary = temporaryDatabase();
    const future = new DatabaseSync(temporary.path);
    future.exec('PRAGMA user_version = 2');
    future.close();
    try {
      expect(() => new TelemetryDatabase(temporary.path, catalog)).toThrow(/newer than supported/u);
    } finally {
      rmSync(temporary.directory, { recursive: true, force: true });
    }
  });
});

describe('telemetry collector configuration', () => {
  const catalogPath = join(process.cwd(), 'services/telemetry/catalog.json');

  it('requires an exact HTTPS origin while allowing loopback HTTP for development', () => {
    expect(() => loadCollectorConfig({}, catalogPath)).toThrow(/ORIGIN is required/u);
    expect(() =>
      loadCollectorConfig(
        { OPEN_MERMAID_TELEMETRY_ORIGIN: 'http://openmermaid.example' },
        catalogPath,
      ),
    ).toThrow(/HTTPS origin/u);
    expect(() =>
      loadCollectorConfig(
        { OPEN_MERMAID_TELEMETRY_ORIGIN: 'https://openmermaid.example/path' },
        catalogPath,
      ),
    ).toThrow(/HTTPS origin/u);
    expect(
      loadCollectorConfig(
        {
          OPEN_MERMAID_TELEMETRY_ORIGIN: 'http://127.0.0.1:8088',
          OPEN_MERMAID_TELEMETRY_PORT: '8092',
          OPEN_MERMAID_TELEMETRY_DATABASE_PATH: ':memory:',
        },
        catalogPath,
      ),
    ).toMatchObject({
      origin: 'http://127.0.0.1:8088',
      port: 8092,
      databasePath: ':memory:',
    });
  });
});

function firstTwentyId(): string {
  return usageEvent(1).eventId;
}

describe('telemetry HTTP collector', () => {
  let directory = '';
  let collector: TelemetryCollector;
  let baseUrl = '';

  beforeEach(async () => {
    const temporary = temporaryDatabase();
    directory = temporary.directory;
    const config: CollectorConfig = {
      origin,
      port: 8091,
      databasePath: temporary.path,
      catalog,
    };
    collector = new TelemetryCollector(config);
    const port = await collector.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${String(port)}`;
  });

  afterEach(async () => {
    await collector.close();
    await expect(collector.close()).resolves.toBeUndefined();
    rmSync(directory, { recursive: true, force: true });
  });

  async function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return await fetch(`${baseUrl}/api/telemetry/v1/template-uses`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-OpenMermaid-Telemetry-Version': '1',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  async function postChunkWithoutEnding(body: string): Promise<number> {
    return await new Promise<number>((resolveStatus, rejectStatus) => {
      let settled = false;
      const timeout = setTimeout(() => {
        request.destroy();
        if (!settled)
          rejectStatus(new Error('Collector did not reject the chunked body promptly.'));
      }, 1_000);
      const request = httpRequest(
        `${baseUrl}/api/telemetry/v1/template-uses`,
        {
          method: 'POST',
          headers: {
            Origin: origin,
            'Content-Type': 'application/json',
            'X-OpenMermaid-Telemetry-Version': '1',
          },
        },
        (response) => {
          settled = true;
          clearTimeout(timeout);
          response.resume();
          resolveStatus(response.statusCode ?? 0);
        },
      );
      request.on('error', (error) => {
        clearTimeout(timeout);
        if (!settled) rejectStatus(error);
      });
      request.write(body);
    });
  }

  it('accepts a strict same-origin batch and serves a bounded public snapshot', async () => {
    const events = Array.from({ length: 16 }, (_, index) => usageEvent(index + 1));
    expect(
      (
        await post({
          schemaVersion: 1,
          events,
        })
      ).status,
    ).toBe(204);
    const counts = await fetch(`${baseUrl}/api/telemetry/v1/template-counts`);
    expect(counts.status).toBe(200);
    expect(counts.headers.get('set-cookie')).toBeNull();
    expect(await counts.json()).toMatchObject({ counts: {} });
    expect((await fetch(`${baseUrl}/healthz`)).status).toBe(200);
    const metrics = await fetch(`${baseUrl}/metrics`);
    expect(metrics.status).toBe(200);
    const metricsBody = await metrics.text();
    expect(metricsBody).toContain('openmermaid_telemetry_events_accepted_total 16');
    expect(metricsBody).toContain('openmermaid_telemetry_database_healthy 1');
    expect(metricsBody).not.toContain(events[0]?.eventId);
    expect(metricsBody).not.toContain('flowchart-starter');
    expect(metricsBody).not.toContain(origin);
  });

  it('rejects cross-origin, GPC, unknown IDs, extra data, and oversized bodies', async () => {
    const batch = { schemaVersion: 1, events: [usageEvent(1)] };
    expect((await post(batch, { Origin: 'https://attacker.example' })).status).toBe(403);
    expect((await post(batch, { 'Sec-GPC': '1' })).status).toBe(403);
    expect(
      (
        await post({
          schemaVersion: 1,
          events: [usageEvent(2, 'unknown-template')],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post({
          schemaVersion: 1,
          events: [{ ...usageEvent(3), source: 'secret' }],
        })
      ).status,
    ).toBe(400);
    expect((await post('x'.repeat(4_097))).status).toBe(413);
    expect(await postChunkWithoutEnding('x'.repeat(4_097))).toBe(413);
  });

  it('rate-limits accepted event volume rather than only request volume', async () => {
    for (let batchIndex = 0; batchIndex < 2; batchIndex += 1) {
      const events = Array.from({ length: 16 }, (_, eventIndex) =>
        usageEvent(batchIndex * 16 + eventIndex + 1),
      );
      expect((await post({ schemaVersion: 1, events })).status).toBe(204);
    }
    expect(
      (
        await post({
          schemaVersion: 1,
          events: [usageEvent(100)],
        })
      ).status,
    ).toBe(429);
  });

  it('rejects wrong methods, query strings, media types, and protocol versions', async () => {
    const batch = { schemaVersion: 1, events: [usageEvent(1)] };
    expect(
      (
        await fetch(`${baseUrl}/api/telemetry/v1/template-uses`, {
          method: 'GET',
        })
      ).status,
    ).toBe(405);
    expect(
      (
        await fetch(`${baseUrl}/api/telemetry/v1/template-counts`, {
          method: 'POST',
        })
      ).status,
    ).toBe(405);
    expect(
      (
        await fetch(`${baseUrl}/api/telemetry/v1/template-counts?template=flowchart`, {
          method: 'GET',
        })
      ).status,
    ).toBe(404);
    expect((await post(batch, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect(
      (
        await post(batch, {
          'X-OpenMermaid-Telemetry-Version': '2',
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await fetch(`${baseUrl}/metrics`, {
          method: 'POST',
        })
      ).status,
    ).toBe(405);
  });
});
