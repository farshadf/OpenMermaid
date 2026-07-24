import type { MetricType } from 'web-vitals';

import {
  LOCAL_VITAL_SCHEMA_VERSION,
  type LocalVitalSampleV1,
  type PerformancePageKind,
} from './contracts';
import { isLocalVitalsHistoryEnabled } from './preference';
import { LocalVitalsRepository } from './repository';
import { isLocalVitalSampleV1 } from './validation';

export const LOCAL_VITAL_RECORDED_EVENT = 'open-mermaid:vital-recorded';
export const LOCAL_VITAL_STORAGE_ERROR_EVENT = 'open-mermaid:vital-storage-error';

let started = false;
let repository: LocalVitalsRepository | undefined;

function normalizedMetricId(name: MetricType['name'], id: string): string {
  const safeId = id.replace(/[^A-Za-z0-9._-]/gu, '').slice(0, 96);
  return `${name}:${safeId || 'metric'}`;
}

export function metricToLocalSample(
  metric: MetricType,
  pageKind: PerformancePageKind,
  measuredAt = new Date().toISOString(),
  viewportWidth = window.innerWidth,
): LocalVitalSampleV1 | undefined {
  const sample: LocalVitalSampleV1 = {
    schemaVersion: LOCAL_VITAL_SCHEMA_VERSION,
    id: normalizedMetricId(metric.name, metric.id),
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    pageKind,
    navigationType: metric.navigationType,
    deviceClass: viewportWidth <= 767 ? 'small' : 'large',
    measuredAt,
  };
  return isLocalVitalSampleV1(sample) ? sample : undefined;
}

function reportSample(sample: LocalVitalSampleV1): void {
  window.dispatchEvent(new CustomEvent(LOCAL_VITAL_RECORDED_EVENT, { detail: sample }));
  if (!isLocalVitalsHistoryEnabled()) return;
  repository ??= new LocalVitalsRepository();
  void repository.upsert(sample).catch(() => {
    window.dispatchEvent(new Event(LOCAL_VITAL_STORAGE_ERROR_EVENT));
  });
}

export async function startLocalVitalsMeasurement(pageKind: PerformancePageKind): Promise<boolean> {
  if (started) return false;
  started = true;
  try {
    const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import('web-vitals');
    const report = (metric: MetricType): void => {
      const sample = metricToLocalSample(metric, pageKind);
      if (sample !== undefined) reportSample(sample);
    };
    onCLS(report);
    onFCP(report);
    onINP(report);
    onLCP(report);
    onTTFB(report);
    return true;
  } catch {
    started = false;
    return false;
  }
}
