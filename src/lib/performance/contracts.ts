export const LOCAL_VITAL_SCHEMA_VERSION = 1 as const;

export const VITAL_NAMES = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;
export type VitalName = (typeof VITAL_NAMES)[number];

export const VITAL_RATINGS = ['good', 'needs-improvement', 'poor'] as const;
export type VitalRating = (typeof VITAL_RATINGS)[number];

export const PERFORMANCE_PAGE_KINDS = [
  'home',
  'editor',
  'templates',
  'template',
  'guides',
  'guide',
  'about',
  'privacy',
  'security',
  'performance',
  'not-found',
  'other',
] as const;
export type PerformancePageKind = (typeof PERFORMANCE_PAGE_KINDS)[number];

export const VITAL_NAVIGATION_TYPES = [
  'navigate',
  'reload',
  'back-forward',
  'back-forward-cache',
  'prerender',
  'restore',
] as const;
export type VitalNavigationType = (typeof VITAL_NAVIGATION_TYPES)[number];

export type VitalDeviceClass = 'small' | 'large';

export interface LocalVitalSampleV1 {
  schemaVersion: typeof LOCAL_VITAL_SCHEMA_VERSION;
  id: string;
  name: VitalName;
  value: number;
  rating: VitalRating;
  pageKind: PerformancePageKind;
  navigationType: VitalNavigationType;
  deviceClass: VitalDeviceClass;
  measuredAt: string;
}

export interface LocalVitalAggregate {
  name: VitalName;
  count: number;
  p75?: number;
  percentGood?: number;
  rating?: VitalRating;
  newestAt?: string;
  directional: boolean;
}

export interface LocalVitalsStats {
  count: number;
  estimatedBytes: number;
  skippedCorruptRecords: number;
  oldestAt?: string;
  newestAt?: string;
}
