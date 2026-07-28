export type AggregateTelemetryMode = 'off' | 'aggregate';

export function normalizeAggregateTelemetryMode(value: unknown): AggregateTelemetryMode {
  return value === 'aggregate' ? 'aggregate' : 'off';
}

export function isAggregateTelemetryEnabled(
  value: unknown = import.meta.env.PUBLIC_TELEMETRY_MODE,
): boolean {
  return normalizeAggregateTelemetryMode(value) === 'aggregate';
}
