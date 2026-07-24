import {
  LOCAL_VITAL_SCHEMA_VERSION,
  PERFORMANCE_PAGE_KINDS,
  VITAL_NAMES,
  VITAL_NAVIGATION_TYPES,
  VITAL_RATINGS,
  type LocalVitalSampleV1,
  type PerformancePageKind,
  type VitalName,
} from './contracts';

const SAMPLE_KEYS = [
  'schemaVersion',
  'id',
  'name',
  'value',
  'rating',
  'pageKind',
  'navigationType',
  'deviceClass',
  'measuredAt',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === SAMPLE_KEYS.length && SAMPLE_KEYS.every((key) => keys.includes(key));
}

export function isVitalName(value: unknown): value is VitalName {
  return typeof value === 'string' && VITAL_NAMES.includes(value as VitalName);
}

export function isPerformancePageKind(value: unknown): value is PerformancePageKind {
  return typeof value === 'string' && PERFORMANCE_PAGE_KINDS.includes(value as PerformancePageKind);
}

export function isLocalVitalSampleV1(value: unknown): value is LocalVitalSampleV1 {
  if (!isRecord(value) || !hasExactKeys(value)) return false;
  if (value.schemaVersion !== LOCAL_VITAL_SCHEMA_VERSION) return false;
  if (!isVitalName(value.name)) return false;
  if (
    typeof value.id !== 'string' ||
    value.id.length > 112 ||
    !new RegExp(`^${value.name}:[A-Za-z0-9._-]{1,96}$`, 'u').test(value.id)
  ) {
    return false;
  }
  if (typeof value.value !== 'number' || !Number.isFinite(value.value) || value.value < 0) {
    return false;
  }
  const maximum = value.name === 'CLS' ? 100 : 600_000;
  if (value.value > maximum) return false;
  if (
    typeof value.rating !== 'string' ||
    !VITAL_RATINGS.includes(value.rating as LocalVitalSampleV1['rating'])
  ) {
    return false;
  }
  if (!isPerformancePageKind(value.pageKind)) return false;
  if (
    typeof value.navigationType !== 'string' ||
    !VITAL_NAVIGATION_TYPES.includes(value.navigationType as LocalVitalSampleV1['navigationType'])
  ) {
    return false;
  }
  if (value.deviceClass !== 'small' && value.deviceClass !== 'large') return false;
  if (typeof value.measuredAt !== 'string') return false;
  const timestamp = Date.parse(value.measuredAt);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value.measuredAt;
}
