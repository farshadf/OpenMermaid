import { describe, expect, it, vi } from 'vitest';

import {
  TEMPLATE_USAGE_CATALOG_VERSION,
  TEMPLATE_USAGE_COUNTS_EVENT,
  TEMPLATE_USAGE_EVENT_KIND,
  type QueuedTemplateUsageEventV1,
  type TemplateUsageCountsEventDetail,
} from '../../../src/lib/telemetry/contracts';
import {
  dispatchTemplateUsageCounts,
  loadTemplateUsageCounts,
} from '../../../src/lib/telemetry/counts';
import { TemplateUsageReporter } from '../../../src/lib/telemetry/reporter';

class MemoryQueue {
  readonly events: QueuedTemplateUsageEventV1[] = [];

  enqueue(event: QueuedTemplateUsageEventV1): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  list(): Promise<QueuedTemplateUsageEventV1[]> {
    return Promise.resolve([...this.events]);
  }

  remove(eventIds: readonly string[]): Promise<void> {
    const remove = new Set(eventIds);
    this.events.splice(
      0,
      this.events.length,
      ...this.events.filter(({ eventId }) => !remove.has(eventId)),
    );
    return Promise.resolve();
  }
}

function timeoutSignal(): AbortSignal {
  return new AbortController().signal;
}

function queuedEvent(index: number): QueuedTemplateUsageEventV1 {
  return {
    eventId: `018f6d4e-8d4e-4d3b-8d4e-${index.toString(16).padStart(12, '0')}`,
    kind: TEMPLATE_USAGE_EVENT_KIND,
    templateId: 'flowchart-starter',
    catalogVersion: TEMPLATE_USAGE_CATALOG_VERSION,
    queuedAt: '2026-07-27T12:00:00.000Z',
  };
}

describe('template usage reporter', () => {
  it('sends only the strict event after opt-in and removes it on acknowledgement', async () => {
    const queue = new MemoryQueue();
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const reporter = new TemplateUsageReporter({
      enabled: true,
      repository: queue,
      sharingEnabled: () => true,
      globalPrivacyControlEnabled: () => false,
      randomUuid: () => '018f6d4e-8d4e-4d3b-8d4e-018f6d4e8d4e',
      now: () => new Date('2026-07-27T12:00:00.000Z'),
      timeoutSignal,
      fetch: (input, init) => {
        requests.push({ input, ...(init === undefined ? {} : { init }) });
        return Promise.resolve({ status: 204 });
      },
    });

    expect(await reporter.record('flowchart-starter')).toBe(true);
    await reporter.flush();
    expect(queue.events).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe('/api/telemetry/v1/template-uses');
    const requestBody = requests[0]?.init?.body;
    expect(typeof requestBody).toBe('string');
    if (typeof requestBody !== 'string') throw new Error('Expected a serialized request body.');
    const body = JSON.parse(requestBody) as Record<string, unknown>;
    expect(body).toEqual({
      schemaVersion: 1,
      events: [
        {
          eventId: '018f6d4e-8d4e-4d3b-8d4e-018f6d4e8d4e',
          kind: TEMPLATE_USAGE_EVENT_KIND,
          templateId: 'flowchart-starter',
          catalogVersion: TEMPLATE_USAGE_CATALOG_VERSION,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toMatch(/source|title|document|fragment|search/iu);
  });

  it('does not enqueue when disabled, GPC-blocked, or given an unknown template', async () => {
    const queue = new MemoryQueue();
    const fetch = vi.fn<() => Promise<{ status: number }>>(() => Promise.resolve({ status: 204 }));
    const disabled = new TemplateUsageReporter({
      enabled: false,
      repository: queue,
      fetch,
      sharingEnabled: () => true,
    });
    const gpc = new TemplateUsageReporter({
      enabled: true,
      repository: queue,
      fetch,
      sharingEnabled: () => true,
      globalPrivacyControlEnabled: () => true,
    });
    const unknown = new TemplateUsageReporter({
      enabled: true,
      repository: queue,
      fetch,
      sharingEnabled: () => true,
      globalPrivacyControlEnabled: () => false,
    });

    expect(await disabled.record('flowchart-starter')).toBe(false);
    expect(await gpc.record('flowchart-starter')).toBe(false);
    expect(await unknown.record('unknown-template')).toBe(false);
    expect(queue.events).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed when secure random event ID generation is unavailable', async () => {
    const queue = new MemoryQueue();
    const reporter = new TemplateUsageReporter({
      enabled: true,
      repository: queue,
      sharingEnabled: () => true,
      globalPrivacyControlEnabled: () => false,
      randomUuid: () => {
        throw new Error('secure randomness unavailable');
      },
    });

    expect(await reporter.record('flowchart-starter')).toBe(false);
    expect(queue.events).toEqual([]);
  });

  it('retains a queued event when the collector is unavailable', async () => {
    const queue = new MemoryQueue();
    const reporter = new TemplateUsageReporter({
      enabled: true,
      repository: queue,
      sharingEnabled: () => true,
      globalPrivacyControlEnabled: () => false,
      randomUuid: () => '018f6d4e-8d4e-4d3b-8d4e-018f6d4e8d4e',
      timeoutSignal,
      fetch: () => Promise.reject(new TypeError('offline')),
    });
    expect(await reporter.record('flowchart-starter')).toBe(true);
    expect(await reporter.flush()).toBe(false);
    expect(queue.events).toHaveLength(1);
  });

  it('drops an event rejected as permanently incompatible by the collector', async () => {
    const queue = new MemoryQueue();
    const reporter = new TemplateUsageReporter({
      enabled: true,
      repository: queue,
      sharingEnabled: () => true,
      globalPrivacyControlEnabled: () => false,
      randomUuid: () => '018f6d4e-8d4e-4d3b-8d4e-018f6d4e8d4e',
      timeoutSignal,
      fetch: () => Promise.resolve({ status: 415 }),
    });
    expect(await reporter.record('flowchart-starter')).toBe(true);
    await reporter.flush();
    expect(queue.events).toEqual([]);
  });

  it('drains a full queue in rate-bounded waves without waiting for another user action', async () => {
    const queue = new MemoryQueue();
    queue.events.push(...Array.from({ length: 64 }, (_, index) => queuedEvent(index + 1)));
    const requests: string[] = [];
    let retry: (() => Promise<void>) | undefined;
    const reporter = new TemplateUsageReporter({
      enabled: true,
      repository: queue,
      sharingEnabled: () => true,
      globalPrivacyControlEnabled: () => false,
      timeoutSignal,
      fetch: (_input, init) => {
        requests.push(typeof init?.body === 'string' ? init.body : '');
        return Promise.resolve({ status: 204 });
      },
      scheduleRetry: (callback, delayMs) => {
        expect(delayMs).toBeGreaterThan(60_000);
        retry = callback;
      },
    });

    expect(await reporter.flush()).toBe(true);
    expect(requests).toHaveLength(2);
    expect(queue.events).toHaveLength(32);
    expect(retry).toBeDefined();
    await retry?.();
    expect(requests).toHaveLength(4);
    expect(queue.events).toEqual([]);
  });
});

describe('template usage counts provider', () => {
  const snapshot = {
    schemaVersion: 1,
    catalogVersion: TEMPLATE_USAGE_CATALOG_VERSION,
    generatedAt: '2026-07-27T12:00:00.000Z',
    counts: { 'flowchart-starter': 100 },
  } as const;

  function response(value: unknown): Pick<Response, 'ok' | 'status' | 'headers' | 'text'> {
    const body = JSON.stringify(value);
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(body.length) }),
      text: () => Promise.resolve(body),
    };
  }

  it('dispatches the catalogue-compatible event for a current validated snapshot', async () => {
    const target = new EventTarget();
    let received: TemplateUsageCountsEventDetail | undefined;
    target.addEventListener(TEMPLATE_USAGE_COUNTS_EVENT, (event) => {
      received = (event as CustomEvent<TemplateUsageCountsEventDetail>).detail;
    });
    expect(
      await dispatchTemplateUsageCounts({
        enabled: true,
        fetch: () => Promise.resolve(response(snapshot)),
        now: () => Date.parse('2026-07-27T13:00:00.000Z'),
        timeoutSignal,
        target,
      }),
    ).toBe(true);
    expect(received).toEqual({
      generatedAt: snapshot.generatedAt,
      counts: snapshot.counts,
    });
  });

  it('caches the latest validated counts so a late catalogue listener can replay them', async () => {
    const telemetryWindow = window as Window & {
      __openMermaidTemplateUsageCountsV1?: TemplateUsageCountsEventDetail;
    };
    delete telemetryWindow.__openMermaidTemplateUsageCountsV1;

    expect(
      await dispatchTemplateUsageCounts({
        enabled: true,
        fetch: () => Promise.resolve(response(snapshot)),
        now: () => Date.parse('2026-07-27T13:00:00.000Z'),
        timeoutSignal,
      }),
    ).toBe(true);
    expect(telemetryWindow.__openMermaidTemplateUsageCountsV1).toEqual({
      generatedAt: snapshot.generatedAt,
      counts: snapshot.counts,
    });

    delete telemetryWindow.__openMermaidTemplateUsageCountsV1;
  });

  it('fails closed for stale, invalid, future-version, and disabled responses', async () => {
    expect(
      await loadTemplateUsageCounts({
        enabled: false,
        fetch: () => {
          throw new Error('must not fetch');
        },
      }),
    ).toBeUndefined();
    expect(
      await loadTemplateUsageCounts({
        enabled: true,
        fetch: () => Promise.resolve(response(snapshot)),
        now: () => Date.parse('2026-07-30T13:00:00.000Z'),
        timeoutSignal,
      }),
    ).toBeUndefined();
    expect(
      await loadTemplateUsageCounts({
        enabled: true,
        fetch: () => Promise.resolve(response({ ...snapshot, schemaVersion: 2 })),
        now: () => Date.parse('2026-07-27T13:00:00.000Z'),
        timeoutSignal,
      }),
    ).toBeUndefined();
  });
});
