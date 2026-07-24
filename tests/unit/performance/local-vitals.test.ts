import {
  LOCAL_VITAL_SCHEMA_VERSION,
  LocalVitalsRepository,
  aggregateLocalVitals,
  classifyPerformancePage,
  isLocalVitalSampleV1,
  isLocalVitalsHistoryEnabled,
  metricToLocalSample,
  nearestRankP75,
  rateVital,
  setLocalVitalsHistoryEnabled,
  type LocalVitalSampleV1,
  type VitalName,
} from '@lib/performance';
import { openDB, type DBSchema } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import type { MetricType } from 'web-vitals';

const NOW = '2026-07-21T18:00:00.000Z';
const databaseNames: string[] = [];

function databaseName(label: string): string {
  const name = `openmermaid-vitals-test-${label}-${crypto.randomUUID()}`;
  databaseNames.push(name);
  return name;
}

function sample(
  name: VitalName = 'LCP',
  overrides: Partial<LocalVitalSampleV1> = {},
): LocalVitalSampleV1 {
  return {
    schemaVersion: LOCAL_VITAL_SCHEMA_VERSION,
    id: `${name}:v5-${crypto.randomUUID()}`,
    name,
    value: name === 'CLS' ? 0.05 : 1_200,
    rating: 'good',
    pageKind: 'home',
    navigationType: 'navigate',
    deviceClass: 'large',
    measuredAt: NOW,
    ...overrides,
  };
}

interface RawVitalsDatabase extends DBSchema {
  'vital-samples': {
    key: string;
    value: unknown;
  };
}

afterEach(() => {
  localStorage.clear();
});

describe('local Web Vitals contracts', () => {
  it('accepts the exact minimized schema and rejects extra, malformed, or oversized fields', () => {
    const valid = sample();
    expect(isLocalVitalSampleV1(valid)).toBe(true);
    expect(isLocalVitalSampleV1({ ...valid, source: 'secret diagram' })).toBe(false);
    expect(isLocalVitalSampleV1({ ...valid, id: 'LCP:unsafe value' })).toBe(false);
    expect(isLocalVitalSampleV1({ ...valid, value: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isLocalVitalSampleV1({ ...valid, schemaVersion: 2 })).toBe(false);
  });

  it('maps paths to fixed categories without retaining query or fragment data', () => {
    expect(classifyPerformancePage('https://example.test/')).toBe('home');
    expect(classifyPerformancePage('/editor/?draft=secret#v1:payload')).toBe('editor');
    expect(classifyPerformancePage('/templates/flowchart-starter/')).toBe('template');
    expect(classifyPerformancePage('/guides/')).toBe('guides');
    expect(classifyPerformancePage('/404/')).toBe('not-found');
    expect(classifyPerformancePage('/unrecognized/')).toBe('other');
  });

  it('keeps local history disabled by default and tolerates blocked storage', () => {
    expect(isLocalVitalsHistoryEnabled(localStorage)).toBe(false);
    expect(setLocalVitalsHistoryEnabled(true, localStorage)).toBe(true);
    expect(isLocalVitalsHistoryEnabled(localStorage)).toBe(true);
    expect(setLocalVitalsHistoryEnabled(false, localStorage)).toBe(true);
    const blocked = {
      getItem: () => {
        throw new DOMException('blocked');
      },
      setItem: () => {
        throw new DOMException('blocked');
      },
      removeItem: () => {
        throw new DOMException('blocked');
      },
    } as unknown as Storage;
    expect(isLocalVitalsHistoryEnabled(blocked)).toBe(false);
    expect(setLocalVitalsHistoryEnabled(true, blocked)).toBe(false);
  });

  it('converts upstream metrics without entries, URLs, or DOM attribution', () => {
    const metric = {
      name: 'INP',
      id: 'v5-123.abc',
      value: 180,
      rating: 'good',
      delta: 180,
      entries: [{ name: 'private-resource-url' } as PerformanceEntry],
      navigationType: 'reload',
    } as MetricType;
    expect(metricToLocalSample(metric, 'editor', NOW, 375)).toEqual({
      schemaVersion: 1,
      id: 'INP:v5-123.abc',
      name: 'INP',
      value: 180,
      rating: 'good',
      pageKind: 'editor',
      navigationType: 'reload',
      deviceClass: 'small',
      measuredAt: NOW,
    });
  });
});

describe('local Web Vitals aggregation', () => {
  it('uses nearest-rank p75 and official metric thresholds', () => {
    expect(nearestRankP75([])).toBeUndefined();
    expect(nearestRankP75([400, 100, 300, 200])).toBe(300);
    expect(rateVital('LCP', 2_500)).toBe('good');
    expect(rateVital('INP', 201)).toBe('needs-improvement');
    expect(rateVital('CLS', 0.26)).toBe('poor');
  });

  it('reports counts, percent good, p75 ratings, and directional samples', () => {
    const values = [1_000, 2_000, 3_000, 5_000].map((value, index) =>
      sample('LCP', {
        id: `LCP:v5-${String(index)}`,
        value,
        rating: rateVital('LCP', value),
      }),
    );
    const lcp = aggregateLocalVitals(values).find(({ name }) => name === 'LCP');
    expect(lcp).toMatchObject({
      count: 4,
      p75: 3_000,
      percentGood: 50,
      rating: 'needs-improvement',
      directional: true,
    });
  });
});

describe('LocalVitalsRepository', () => {
  it('upserts repeated metric IDs and keeps data in a separate database', async () => {
    const repository = new LocalVitalsRepository(databaseName('upsert'));
    const first = sample('CLS', { id: 'CLS:v5-repeat', value: 0.05 });
    const updated = sample('CLS', {
      id: 'CLS:v5-repeat',
      value: 0.12,
      rating: 'needs-improvement',
    });
    await repository.upsert(first, Date.parse(NOW));
    await repository.upsert(updated, Date.parse(NOW));
    await expect(repository.list(Date.parse(NOW))).resolves.toEqual([updated]);
    await expect(repository.stats(Date.parse(NOW))).resolves.toMatchObject({
      count: 1,
      skippedCorruptRecords: 0,
    });
    await repository.close();
  });

  it('prunes records outside the 30-day retention window', async () => {
    const repository = new LocalVitalsRepository(databaseName('retention'));
    const old = sample('FCP', {
      id: 'FCP:v5-old',
      measuredAt: '2026-05-01T00:00:00.000Z',
    });
    const current = sample('FCP', { id: 'FCP:v5-current' });
    await repository.upsert(old, Date.parse(NOW));
    await repository.upsert(current, Date.parse(NOW));
    await expect(repository.list(Date.parse(NOW))).resolves.toEqual([current]);
    await repository.close();
  });

  it('rejects records that fail the strict privacy schema', async () => {
    const repository = new LocalVitalsRepository(databaseName('invalid'));
    await expect(
      repository.upsert({ ...sample(), rawPath: '/editor/#secret' } as LocalVitalSampleV1),
    ).rejects.toThrow('Invalid local Web Vital sample');
    await repository.close();
  });

  it('skips corrupt stored values when reading stats', async () => {
    const name = databaseName('corrupt');
    const repository = new LocalVitalsRepository(name);
    await repository.upsert(sample('TTFB', { id: 'TTFB:v5-valid' }), Date.parse(NOW));
    await repository.close();
    const raw = await openDB<RawVitalsDatabase>(name, 1);
    await raw.put('vital-samples', { id: 'TTFB:v5-corrupt', source: 'must not survive' });
    raw.close();
    const reopened = new LocalVitalsRepository(name);
    await expect(reopened.stats(Date.parse(NOW))).resolves.toMatchObject({
      count: 1,
      skippedCorruptRecords: 1,
    });
    await reopened.close();
  });
});
