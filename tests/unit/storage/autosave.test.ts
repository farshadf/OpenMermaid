import {
  createDiagramDocument,
  updateDiagramDocument,
  type DiagramDocumentV1,
} from '@lib/documents';
import { AutosaveCoordinator } from '@lib/storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

const FIRST_TIME = '2026-07-21T10:00:00.000Z';
const SECOND_TIME = '2026-07-21T10:01:00.000Z';

describe('AutosaveCoordinator', () => {
  afterEach(() => vi.useRealTimers());

  it('debounces changes and saves only the newest document', async () => {
    vi.useFakeTimers();
    const saved: DiagramDocumentV1[] = [];
    const coordinator = new AutosaveCoordinator({
      delayMs: 300,
      save(document) {
        saved.push(document);
        return Promise.resolve();
      },
    });
    const original = createDiagramDocument({ id: 'autosave', now: FIRST_TIME });
    coordinator.schedule(original);
    coordinator.schedule(
      updateDiagramDocument(original, { source: 'graph TD\n A --> B' }, SECOND_TIME),
    );

    await vi.advanceTimersByTimeAsync(299);
    expect(saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.source).toContain('A --> B');
    expect(coordinator.snapshot).toEqual({ state: 'idle' });
    coordinator.dispose();
  });

  it('retains a failed save for an explicit retry', async () => {
    const failure = new Error('storage unavailable');
    const save = vi
      .fn<(_: DiagramDocumentV1) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce();
    const coordinator = new AutosaveCoordinator({ save });
    coordinator.schedule(createDiagramDocument({ id: 'retry', now: FIRST_TIME }));

    await expect(coordinator.flush()).rejects.toBe(failure);
    expect(coordinator.snapshot).toEqual({ state: 'error', error: failure });
    await coordinator.retry();
    expect(save).toHaveBeenCalledTimes(2);
    expect(coordinator.snapshot).toEqual({ state: 'idle' });
    coordinator.dispose();
  });

  it('does not requeue a cancelled in-flight failure', async () => {
    let rejectSave: ((reason: Error) => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    const coordinator = new AutosaveCoordinator({ save });
    coordinator.schedule(createDiagramDocument({ id: 'cancelled', now: FIRST_TIME }));
    const flush = coordinator.flush();
    const cancelled = coordinator.cancelAndWait();

    rejectSave?.(new Error('late storage failure'));
    await expect(flush).rejects.toThrow('late storage failure');
    await cancelled;

    expect(coordinator.snapshot).toEqual({ state: 'idle' });
    await coordinator.flush();
    expect(save).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });
});
