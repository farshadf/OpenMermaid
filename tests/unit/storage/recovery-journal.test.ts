import { createDiagramDocument, updateDiagramDocument } from '@lib/documents';
import {
  RECOVERY_JOURNAL_KEY,
  clearRecoveryJournal,
  readRecoveryJournal,
  writeRecoveryJournal,
} from '@lib/storage';
import { beforeEach, describe, expect, it } from 'vitest';

describe('pending draft recovery journal', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a validated pending draft and clears only the matching save', () => {
    const pending = createDiagramDocument({ id: 'pending-draft' });
    expect(writeRecoveryJournal(pending, 0)).toBe(true);
    expect(readRecoveryJournal()).toEqual({ document: pending, expectedRevision: 0 });

    const older = updateDiagramDocument(pending, { source: 'flowchart LR\n  Older --> Value' });
    clearRecoveryJournal(older);
    expect(readRecoveryJournal()).toEqual({ document: pending, expectedRevision: 0 });

    clearRecoveryJournal(pending);
    expect(readRecoveryJournal()).toBeUndefined();
  });

  it('discards malformed journal data without throwing', () => {
    localStorage.setItem(RECOVERY_JOURNAL_KEY, '{not json');
    expect(readRecoveryJournal()).toBeUndefined();
    expect(localStorage.getItem(RECOVERY_JOURNAL_KEY)).toBeNull();
  });
});
