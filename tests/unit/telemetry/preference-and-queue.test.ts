import { beforeEach, describe, expect, it } from 'vitest';

import {
  TEMPLATE_USAGE_CATALOG_VERSION,
  TEMPLATE_USAGE_EVENT_KIND,
  type QueuedTemplateUsageEventV1,
} from '../../../src/lib/telemetry/contracts';
import {
  TEMPLATE_USAGE_PREFERENCE_KEY,
  isGlobalPrivacyControlEnabled,
  isTemplateUsageSharingEnabled,
  setTemplateUsageSharingEnabled,
} from '../../../src/lib/telemetry/preference';
import {
  TEMPLATE_USAGE_QUEUE_MAX_RECORDS,
  TEMPLATE_USAGE_QUEUE_RETENTION_MS,
  TemplateUsageQueueRepository,
} from '../../../src/lib/telemetry/queue';

function event(index: number, queuedAt: string): QueuedTemplateUsageEventV1 {
  const suffix = index.toString(16).padStart(12, '0');
  return {
    eventId: `018f6d4e-8d4e-4d3b-8d4e-${suffix}`,
    kind: TEMPLATE_USAGE_EVENT_KIND,
    templateId: 'flowchart-starter',
    catalogVersion: TEMPLATE_USAGE_CATALOG_VERSION,
    queuedAt,
  };
}

describe('aggregate telemetry preference', () => {
  beforeEach(() => localStorage.clear());

  it('is off by default and Global Privacy Control overrides a stored opt-in', () => {
    expect(isTemplateUsageSharingEnabled(localStorage, {})).toBe(false);
    expect(setTemplateUsageSharingEnabled(true, localStorage, {})).toBe(true);
    expect(isTemplateUsageSharingEnabled(localStorage, {})).toBe(true);
    expect(setTemplateUsageSharingEnabled(false, localStorage, {})).toBe(false);
    expect(isTemplateUsageSharingEnabled(localStorage, {})).toBe(false);
    expect(isGlobalPrivacyControlEnabled({ globalPrivacyControl: true })).toBe(true);
    expect(isTemplateUsageSharingEnabled(localStorage, { globalPrivacyControl: true })).toBe(false);
  });

  it('removes rather than stores an enabled value when GPC is active', () => {
    localStorage.setItem(TEMPLATE_USAGE_PREFERENCE_KEY, 'enabled');
    expect(
      setTemplateUsageSharingEnabled(true, localStorage, {
        globalPrivacyControl: true,
      }),
    ).toBe(false);
    expect(localStorage.getItem(TEMPLATE_USAGE_PREFERENCE_KEY)).toBeNull();
  });
});

describe('aggregate telemetry queue', () => {
  it('prunes expired and excess records while returning oldest first', async () => {
    const repository = new TemplateUsageQueueRepository(`telemetry-${crypto.randomUUID()}`);
    const now = Date.parse('2026-07-27T12:00:00.000Z');
    try {
      await repository.enqueue(
        event(1, new Date(now - TEMPLATE_USAGE_QUEUE_RETENTION_MS - 1).toISOString()),
        now,
      );
      for (let index = 2; index < TEMPLATE_USAGE_QUEUE_MAX_RECORDS + 8; index += 1) {
        await repository.enqueue(event(index, new Date(now - index * 1_000).toISOString()), now);
      }
      const queued = await repository.list(now);
      expect(queued).toHaveLength(TEMPLATE_USAGE_QUEUE_MAX_RECORDS);
      expect(queued.some(({ eventId }) => eventId.endsWith('000000000001'))).toBe(false);
      expect(queued.map(({ queuedAt }) => queuedAt)).toEqual(
        [...queued.map(({ queuedAt }) => queuedAt)].sort(),
      );
    } finally {
      await repository.clear();
      await repository.close();
    }
  });

  it('removes acknowledged IDs and clears independently of document storage', async () => {
    const repository = new TemplateUsageQueueRepository(`telemetry-${crypto.randomUUID()}`);
    const first = event(20, '2026-07-27T12:00:00.000Z');
    const second = event(21, '2026-07-27T12:01:00.000Z');
    try {
      await repository.enqueue(first);
      await repository.enqueue(second);
      await repository.remove([first.eventId]);
      expect((await repository.list()).map(({ eventId }) => eventId)).toEqual([second.eventId]);
      await repository.clear();
      expect(await repository.list()).toEqual([]);
    } finally {
      await repository.close();
    }
  });
});
