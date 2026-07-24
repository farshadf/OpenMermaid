import {
  VITAL_NAMES,
  type LocalVitalAggregate,
  type LocalVitalSampleV1,
  type VitalName,
  type VitalRating,
} from './contracts';

export const LOCAL_VITAL_DIRECTIONAL_SAMPLE_COUNT = 20;

export const VITAL_THRESHOLDS: Readonly<Record<VitalName, readonly [number, number]>> = {
  LCP: [2_500, 4_000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1_800, 3_000],
  TTFB: [800, 1_800],
};

export function rateVital(name: VitalName, value: number): VitalRating {
  const [good, poor] = VITAL_THRESHOLDS[name];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

export function nearestRankP75(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)];
}

export function aggregateLocalVitals(
  samples: readonly LocalVitalSampleV1[],
): LocalVitalAggregate[] {
  return VITAL_NAMES.map((name) => {
    const matching = samples.filter((sample) => sample.name === name);
    const p75 = nearestRankP75(matching.map((sample) => sample.value));
    const newestAt = matching
      .map((sample) => sample.measuredAt)
      .sort((left, right) => right.localeCompare(left))[0];
    return {
      name,
      count: matching.length,
      directional: matching.length < LOCAL_VITAL_DIRECTIONAL_SAMPLE_COUNT,
      ...(p75 === undefined ? {} : { p75, rating: rateVital(name, p75) }),
      ...(matching.length === 0
        ? {}
        : {
            percentGood:
              (matching.filter((sample) => sample.rating === 'good').length / matching.length) *
              100,
          }),
      ...(newestAt === undefined ? {} : { newestAt }),
    };
  });
}
