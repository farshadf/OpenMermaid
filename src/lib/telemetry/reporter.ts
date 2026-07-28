import {
  TEMPLATE_USAGE_CATALOG_VERSION,
  TEMPLATE_USAGE_EVENT_KIND,
  TEMPLATE_USAGE_MAX_BATCH_EVENTS,
  TEMPLATE_USAGE_MAX_REQUEST_BYTES,
  TEMPLATE_USAGE_SCHEMA_VERSION,
  type TemplateUsageBatchV1,
  type TemplateUsageEventV1,
} from './contracts';
import { isTelemetryTemplateId } from './catalog';
import { isAggregateTelemetryEnabled } from './mode';
import { isGlobalPrivacyControlEnabled, isTemplateUsageSharingEnabled } from './preference';
import { TemplateUsageQueueRepository } from './queue';

export const TEMPLATE_USAGE_EVENTS_ENDPOINT = '/api/telemetry/v1/template-uses';
const REQUEST_TIMEOUT_MS = 3_000;
const MAX_BATCHES_PER_FLUSH = 2;
const RETRY_DELAY_MS = 61_000;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, 'status'>>;

interface TemplateUsageReporterOptions {
  readonly enabled?: boolean;
  readonly fetch?: FetchLike;
  readonly repository?: TemplateUsageQueue;
  readonly now?: () => Date;
  readonly randomUuid?: () => string;
  readonly sharingEnabled?: () => boolean;
  readonly globalPrivacyControlEnabled?: () => boolean;
  readonly timeoutSignal?: () => AbortSignal;
  readonly scheduleRetry?: (callback: () => Promise<void>, delayMs: number) => void;
}

interface TemplateUsageQueue {
  enqueue(event: import('./contracts').QueuedTemplateUsageEventV1): Promise<void>;
  list(): Promise<import('./contracts').QueuedTemplateUsageEventV1[]>;
  remove(eventIds: readonly string[]): Promise<void>;
}

function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return window.fetch(input, init);
}

function browserRandomUuid(): string {
  return window.crypto.randomUUID();
}

function defaultTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function defaultScheduleRetry(callback: () => Promise<void>, delayMs: number): void {
  window.setTimeout(() => {
    void callback();
  }, delayMs);
}

function requestByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export class TemplateUsageReporter {
  readonly #enabled: boolean;
  readonly #fetch: FetchLike;
  readonly #repository: TemplateUsageQueue;
  readonly #now: () => Date;
  readonly #randomUuid: () => string;
  readonly #sharingEnabled: () => boolean;
  readonly #globalPrivacyControlEnabled: () => boolean;
  readonly #timeoutSignal: () => AbortSignal;
  readonly #scheduleRetry: (callback: () => Promise<void>, delayMs: number) => void;
  #flushPromise: Promise<boolean> | undefined;
  #retryScheduled = false;

  constructor(options: TemplateUsageReporterOptions = {}) {
    this.#enabled = options.enabled ?? isAggregateTelemetryEnabled();
    this.#fetch = options.fetch ?? browserFetch;
    this.#repository = options.repository ?? new TemplateUsageQueueRepository();
    this.#now = options.now ?? (() => new Date());
    this.#randomUuid = options.randomUuid ?? browserRandomUuid;
    this.#sharingEnabled = options.sharingEnabled ?? isTemplateUsageSharingEnabled;
    this.#globalPrivacyControlEnabled =
      options.globalPrivacyControlEnabled ?? isGlobalPrivacyControlEnabled;
    this.#timeoutSignal = options.timeoutSignal ?? defaultTimeoutSignal;
    this.#scheduleRetry = options.scheduleRetry ?? defaultScheduleRetry;
  }

  async record(templateId: string): Promise<boolean> {
    if (
      !this.#enabled ||
      !this.#sharingEnabled() ||
      this.#globalPrivacyControlEnabled() ||
      !isTelemetryTemplateId(templateId)
    ) {
      return false;
    }

    try {
      const event: TemplateUsageEventV1 = {
        eventId: this.#randomUuid(),
        kind: TEMPLATE_USAGE_EVENT_KIND,
        templateId,
        catalogVersion: TEMPLATE_USAGE_CATALOG_VERSION,
      };
      await this.#repository.enqueue({
        ...event,
        queuedAt: this.#now().toISOString(),
      });
    } catch {
      return false;
    }
    void this.flush();
    return true;
  }

  flush(): Promise<boolean> {
    if (this.#flushPromise !== undefined) return this.#flushPromise;
    this.#flushPromise = this.#flush().finally(() => {
      this.#flushPromise = undefined;
    });
    return this.#flushPromise;
  }

  async #flush(): Promise<boolean> {
    if (!this.#enabled || !this.#sharingEnabled() || this.#globalPrivacyControlEnabled()) {
      return false;
    }

    for (let batchIndex = 0; batchIndex < MAX_BATCHES_PER_FLUSH; batchIndex += 1) {
      let queued;
      try {
        queued = (await this.#repository.list()).slice(0, TEMPLATE_USAGE_MAX_BATCH_EVENTS);
      } catch {
        return false;
      }
      if (queued.length === 0) return true;

      const batch: TemplateUsageBatchV1 = {
        schemaVersion: TEMPLATE_USAGE_SCHEMA_VERSION,
        events: queued.map(({ eventId, kind, templateId, catalogVersion }) => ({
          eventId,
          kind,
          templateId,
          catalogVersion,
        })),
      };
      if (requestByteLength(batch) > TEMPLATE_USAGE_MAX_REQUEST_BYTES) return false;

      try {
        const response = await this.#fetch(TEMPLATE_USAGE_EVENTS_ENDPOINT, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-OpenMermaid-Telemetry-Version': '1',
          },
          body: JSON.stringify(batch),
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          keepalive: true,
          signal: this.#timeoutSignal(),
        });
        if (response.status === 204) {
          await this.#repository.remove(queued.map(({ eventId }) => eventId));
          continue;
        }
        if ([400, 403, 413, 415].includes(response.status)) {
          await this.#repository.remove(queued.map(({ eventId }) => eventId));
          continue;
        }
        return false;
      } catch {
        return false;
      }
    }

    let hasRemainingEvents = false;
    try {
      hasRemainingEvents = (await this.#repository.list()).length > 0;
    } catch {
      return false;
    }
    if (hasRemainingEvents) this.#scheduleNextFlush();
    return true;
  }

  #scheduleNextFlush(): void {
    if (this.#retryScheduled) return;
    this.#retryScheduled = true;
    this.#scheduleRetry(async () => {
      this.#retryScheduled = false;
      await this.flush();
    }, RETRY_DELAY_MS);
  }
}

let defaultReporter: TemplateUsageReporter | undefined;

function reporter(): TemplateUsageReporter {
  defaultReporter ??= new TemplateUsageReporter();
  return defaultReporter;
}

export function recordTemplateApplied(templateId: string): void {
  void reporter()
    .record(templateId)
    .catch(() => undefined);
}

export function flushTemplateUsageQueue(): void {
  void reporter()
    .flush()
    .catch(() => undefined);
}
