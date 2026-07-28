import {
  TEMPLATE_USAGE_CATALOG_VERSION,
  TEMPLATE_USAGE_COUNTS_EVENT,
  TEMPLATE_USAGE_COUNTS_MAX_AGE_MS,
  TEMPLATE_USAGE_MAX_RESPONSE_BYTES,
  isTemplateUsageCountsSnapshotV1,
  type TemplateUsageCountsEventDetail,
  type TemplateUsageCountsSnapshotV1,
} from './contracts';
import { isAggregateTelemetryEnabled } from './mode';

export const TEMPLATE_USAGE_COUNTS_ENDPOINT = '/api/telemetry/v1/template-counts';
const COUNTS_TIMEOUT_MS = 2_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

type CountsResponse = Pick<Response, 'ok' | 'status' | 'headers' | 'text'>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<CountsResponse>;

interface TemplateUsageCountsOptions {
  readonly enabled?: boolean;
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  readonly timeoutSignal?: () => AbortSignal;
  readonly target?: EventTarget;
}

interface TemplateUsageCountsWindow extends Window {
  __openMermaidTemplateUsageCountsV1?: TemplateUsageCountsEventDetail;
}

function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return window.fetch(input, init);
}

function defaultTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(COUNTS_TIMEOUT_MS);
}

export function isCurrentTemplateUsageCountsSnapshot(
  snapshot: TemplateUsageCountsSnapshotV1,
  now = Date.now(),
): boolean {
  const generatedAt = Date.parse(snapshot.generatedAt);
  return (
    snapshot.catalogVersion === TEMPLATE_USAGE_CATALOG_VERSION &&
    generatedAt <= now + MAX_FUTURE_SKEW_MS &&
    generatedAt >= now - TEMPLATE_USAGE_COUNTS_MAX_AGE_MS
  );
}

export async function loadTemplateUsageCounts(
  options: TemplateUsageCountsOptions = {},
): Promise<TemplateUsageCountsSnapshotV1 | undefined> {
  if (!(options.enabled ?? isAggregateTelemetryEnabled())) return undefined;
  const fetchImpl = options.fetch ?? browserFetch;
  const now = options.now ?? Date.now;
  const timeoutSignal = options.timeoutSignal ?? defaultTimeoutSignal;

  try {
    const response = await fetchImpl(TEMPLATE_USAGE_COUNTS_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: timeoutSignal(),
    });
    if (!response.ok || response.status !== 200) return undefined;
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > TEMPLATE_USAGE_MAX_RESPONSE_BYTES) {
      return undefined;
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > TEMPLATE_USAGE_MAX_RESPONSE_BYTES) {
      return undefined;
    }
    const value: unknown = JSON.parse(text);
    if (
      !isTemplateUsageCountsSnapshotV1(value) ||
      !isCurrentTemplateUsageCountsSnapshot(value, now())
    ) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

export async function dispatchTemplateUsageCounts(
  options: TemplateUsageCountsOptions = {},
): Promise<boolean> {
  const snapshot = await loadTemplateUsageCounts(options);
  if (snapshot === undefined) return false;
  const detail: TemplateUsageCountsEventDetail = {
    generatedAt: snapshot.generatedAt,
    counts: Object.freeze({ ...snapshot.counts }),
  };
  const target = options.target ?? window;
  if (target === window) {
    (window as TemplateUsageCountsWindow).__openMermaidTemplateUsageCountsV1 = detail;
  }
  target.dispatchEvent(
    new CustomEvent<TemplateUsageCountsEventDetail>(TEMPLATE_USAGE_COUNTS_EVENT, {
      detail,
    }),
  );
  return true;
}
