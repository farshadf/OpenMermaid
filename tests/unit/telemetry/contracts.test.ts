import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { diagramTemplates } from '../../../src/data/templates';
import { MERMAID_CATALOG_VERSION } from '../../../src/lib/mermaid-language/catalog';
import {
  TELEMETRY_TEMPLATE_CATALOG_VERSION,
  TELEMETRY_TEMPLATE_IDS,
  isTelemetryTemplateId,
} from '../../../src/lib/telemetry/catalog';
import {
  TEMPLATE_USAGE_CATALOG_VERSION,
  TEMPLATE_USAGE_EVENT_KIND,
  isTemplateUsageBatchV1,
  isTemplateUsageCountsSnapshotV1,
  isTemplateUsageEventV1,
} from '../../../src/lib/telemetry/contracts';

const validEvent = {
  eventId: '018f6d4e-8d4e-4d3b-8d4e-018f6d4e8d4e',
  kind: TEMPLATE_USAGE_EVENT_KIND,
  templateId: 'flowchart-starter',
  catalogVersion: TEMPLATE_USAGE_CATALOG_VERSION,
} as const;

describe('aggregate template telemetry contracts', () => {
  it('keeps the lightweight client and collector allowlists aligned with the catalog', () => {
    const serviceCatalog: unknown = JSON.parse(
      readFileSync(join(process.cwd(), 'services/telemetry/catalog.json'), 'utf8'),
    );
    expect(TELEMETRY_TEMPLATE_IDS).toEqual(diagramTemplates.map(({ slug }) => slug));
    expect(TELEMETRY_TEMPLATE_CATALOG_VERSION).toBe(MERMAID_CATALOG_VERSION);
    expect(serviceCatalog).toEqual({
      catalogVersion: TELEMETRY_TEMPLATE_CATALOG_VERSION,
      templateIds: [...TELEMETRY_TEMPLATE_IDS],
    });
  });

  it('accepts only exact, bounded event and batch shapes', () => {
    expect(isTemplateUsageEventV1(validEvent)).toBe(true);
    expect(isTemplateUsageEventV1({ ...validEvent, source: 'secret' })).toBe(false);
    expect(isTemplateUsageEventV1({ ...validEvent, eventId: 'not-a-uuid' })).toBe(false);
    expect(
      isTemplateUsageBatchV1({
        schemaVersion: 1,
        events: [validEvent],
      }),
    ).toBe(true);
    expect(isTemplateUsageBatchV1({ schemaVersion: 2, events: [validEvent] })).toBe(false);
    expect(isTemplateUsageBatchV1({ schemaVersion: 1, events: [] })).toBe(false);
  });

  it('validates bounded aggregate snapshots without accepting extra properties', () => {
    const snapshot = {
      schemaVersion: 1,
      catalogVersion: TEMPLATE_USAGE_CATALOG_VERSION,
      generatedAt: '2026-07-27T12:00:00.000Z',
      counts: { 'flowchart-starter': 100 },
    };
    expect(isTemplateUsageCountsSnapshotV1(snapshot)).toBe(true);
    expect(isTemplateUsageCountsSnapshotV1({ ...snapshot, userCount: 12 })).toBe(false);
    expect(
      isTemplateUsageCountsSnapshotV1({
        ...snapshot,
        counts: { 'flowchart-starter': -1 },
      }),
    ).toBe(false);
  });

  it('rejects identifiers outside the generated allowlist', () => {
    expect(isTelemetryTemplateId('flowchart-starter')).toBe(true);
    expect(isTelemetryTemplateId('made-up-template')).toBe(false);
  });
});
