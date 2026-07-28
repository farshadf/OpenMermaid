import {
  TEMPLATE_USAGE_COUNTS_EVENT,
  type TemplateUsageCountsEventDetail,
} from '../templates/usage-event';

export { TEMPLATE_USAGE_COUNTS_EVENT };
export type { TemplateUsageCountsEventDetail };

export const TEMPLATE_USAGE_SCHEMA_VERSION = 1 as const;
export const TEMPLATE_USAGE_EVENT_KIND = 'template_applied' as const;
export const TEMPLATE_USAGE_CATALOG_VERSION = '11.16.0-v2';
export const TEMPLATE_USAGE_MAX_BATCH_EVENTS = 16;
export const TEMPLATE_USAGE_MAX_REQUEST_BYTES = 4_096;
export const TEMPLATE_USAGE_MAX_RESPONSE_BYTES = 16_384;
export const TEMPLATE_USAGE_COUNTS_MAX_AGE_MS = 48 * 60 * 60 * 1_000;

const TEMPLATE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EVENT_KEYS = ['catalogVersion', 'eventId', 'kind', 'templateId'] as const;
const BATCH_KEYS = ['events', 'schemaVersion'] as const;
const SNAPSHOT_KEYS = ['catalogVersion', 'counts', 'generatedAt', 'schemaVersion'] as const;

export interface TemplateUsageEventV1 {
  readonly eventId: string;
  readonly kind: typeof TEMPLATE_USAGE_EVENT_KIND;
  readonly templateId: string;
  readonly catalogVersion: string;
}

export interface TemplateUsageBatchV1 {
  readonly schemaVersion: typeof TEMPLATE_USAGE_SCHEMA_VERSION;
  readonly events: readonly TemplateUsageEventV1[];
}

/**
 * Counts are privacy-coarsened lower bounds rather than real-time raw totals.
 * A value of 100 is displayed as "100+"; entries below the publication
 * threshold are omitted entirely.
 */
export interface TemplateUsageCountsSnapshotV1 {
  readonly schemaVersion: typeof TEMPLATE_USAGE_SCHEMA_VERSION;
  readonly catalogVersion: string;
  readonly generatedAt: string;
  readonly counts: Readonly<Record<string, number>>;
}

export interface QueuedTemplateUsageEventV1 extends TemplateUsageEventV1 {
  readonly queuedAt: string;
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

export function isTemplateId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && TEMPLATE_ID_PATTERN.test(value);
}

export function isTemplateUsageEventV1(value: unknown): value is TemplateUsageEventV1 {
  if (!isRecord(value) || !hasExactKeys(value, EVENT_KEYS)) return false;
  return (
    typeof value.eventId === 'string' &&
    EVENT_ID_PATTERN.test(value.eventId) &&
    value.kind === TEMPLATE_USAGE_EVENT_KIND &&
    isTemplateId(value.templateId) &&
    typeof value.catalogVersion === 'string' &&
    value.catalogVersion.length > 0 &&
    value.catalogVersion.length <= 48
  );
}

export function isTemplateUsageBatchV1(value: unknown): value is TemplateUsageBatchV1 {
  if (!isRecord(value) || !hasExactKeys(value, BATCH_KEYS)) return false;
  return (
    value.schemaVersion === TEMPLATE_USAGE_SCHEMA_VERSION &&
    Array.isArray(value.events) &&
    value.events.length > 0 &&
    value.events.length <= TEMPLATE_USAGE_MAX_BATCH_EVENTS &&
    value.events.every(isTemplateUsageEventV1)
  );
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function isQueuedTemplateUsageEventV1(value: unknown): value is QueuedTemplateUsageEventV1 {
  if (!isRecord(value)) return false;
  const { queuedAt, ...event } = value;
  return isCanonicalIsoTimestamp(queuedAt) && isTemplateUsageEventV1(event);
}

export function isTemplateUsageCountsSnapshotV1(
  value: unknown,
): value is TemplateUsageCountsSnapshotV1 {
  if (!isRecord(value) || !hasExactKeys(value, SNAPSHOT_KEYS)) return false;
  if (
    value.schemaVersion !== TEMPLATE_USAGE_SCHEMA_VERSION ||
    typeof value.catalogVersion !== 'string' ||
    value.catalogVersion.length === 0 ||
    value.catalogVersion.length > 48 ||
    !isCanonicalIsoTimestamp(value.generatedAt) ||
    !isRecord(value.counts)
  ) {
    return false;
  }

  const entries = Object.entries(value.counts);
  return (
    entries.length <= 256 &&
    entries.every(
      ([templateId, count]) =>
        isTemplateId(templateId) &&
        typeof count === 'number' &&
        Number.isSafeInteger(count) &&
        count >= 0 &&
        count <= 1_000_000_000_000,
    )
  );
}
