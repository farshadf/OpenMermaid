import { describe, expect, it } from 'vitest';

import { SerializedTaskQueue } from '../../../src/lib/rendering/queue';

describe('SerializedTaskQueue', () => {
  it('runs Mermaid work one operation at a time and survives a rejection', async () => {
    const queue = new SerializedTaskQueue();
    const events: string[] = [];

    const first = queue.enqueue(async () => {
      events.push('first:start');
      await Promise.resolve();
      events.push('first:end');
      throw new Error('invalid source');
    });
    const second = queue.enqueue(() => {
      events.push('second');
      return 'rendered';
    });

    await expect(first).rejects.toThrow('invalid source');
    await expect(second).resolves.toBe('rendered');
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });
});
