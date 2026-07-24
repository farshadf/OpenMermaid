import {
  DiagramStorageError,
  isDocumentChangeNotification,
  normalizeStorageError,
} from '@lib/storage';
import { describe, expect, it } from 'vitest';

const baseNotification = {
  protocol: 'openmermaid-documents-v1',
  senderId: 'test-tab',
  timestamp: '2026-07-21T10:00:00.000Z',
} as const;

describe('storage error normalization', () => {
  it('preserves normalized errors and classifies browser storage failures', () => {
    const normalized = new DiagramStorageError('unavailable', 'already normalized');
    expect(normalizeStorageError(normalized)).toBe(normalized);
    expect(normalizeStorageError(new DOMException('full', 'QuotaExceededError'))).toMatchObject({
      code: 'quota_exceeded',
    });
    for (const name of ['InvalidStateError', 'NotAllowedError', 'SecurityError', 'UnknownError']) {
      expect(normalizeStorageError(new DOMException('blocked', name))).toMatchObject({
        code: 'unavailable',
      });
    }
    expect(normalizeStorageError(new Error('other'))).toMatchObject({
      code: 'operation_failed',
    });
  });
});

describe('document change protocol validation', () => {
  it('accepts exact put, delete, and clear shapes', () => {
    expect(
      isDocumentChangeNotification({
        ...baseNotification,
        kind: 'put',
        id: 'diagram',
        revision: 0,
      }),
    ).toBe(true);
    expect(
      isDocumentChangeNotification({ ...baseNotification, kind: 'delete', id: 'diagram' }),
    ).toBe(true);
    expect(isDocumentChangeNotification({ ...baseNotification, kind: 'clear' })).toBe(true);
  });

  it.each([
    null,
    {},
    { ...baseNotification, protocol: 'wrong', kind: 'clear' },
    { ...baseNotification, kind: 'unknown' },
    { ...baseNotification, kind: 'put', id: '', revision: 0 },
    { ...baseNotification, kind: 'put', id: 'diagram', revision: -1 },
    { ...baseNotification, kind: 'delete', id: 'diagram', revision: 1 },
    { ...baseNotification, kind: 'clear', id: 'diagram' },
    { ...baseNotification, kind: 'clear', timestamp: 'not-a-date' },
  ])('rejects malformed notification %#', (value) => {
    expect(isDocumentChangeNotification(value)).toBe(false);
  });
});
