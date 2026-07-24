import { validateDiagramDocument, type DiagramDocumentV1 } from '../documents';

export const RECOVERY_JOURNAL_KEY = 'openmermaid:pending-draft:v1';

type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface RecoveryJournalEntry {
  readonly document: DiagramDocumentV1;
  readonly expectedRevision?: number;
}

function samePendingContent(left: DiagramDocumentV1, right: DiagramDocumentV1): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.source === right.source &&
    left.appearance.theme === right.appearance.theme &&
    left.appearance.background === right.appearance.background
  );
}

export function writeRecoveryJournal(
  document: DiagramDocumentV1,
  expectedRevision: number | undefined,
  storage: RecoveryStorage = localStorage,
): boolean {
  try {
    storage.setItem(
      RECOVERY_JOURNAL_KEY,
      JSON.stringify({ document: validateDiagramDocument(document), expectedRevision }),
    );
    return true;
  } catch {
    return false;
  }
}

export function readRecoveryJournal(
  storage: RecoveryStorage = localStorage,
): RecoveryJournalEntry | undefined {
  let serialized: string | null;
  try {
    serialized = storage.getItem(RECOVERY_JOURNAL_KEY);
  } catch {
    return undefined;
  }
  if (serialized === null) return undefined;

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (typeof parsed !== 'object' || parsed === null || !('document' in parsed)) {
      throw new TypeError('Invalid recovery journal envelope.');
    }
    const expectedRevision =
      'expectedRevision' in parsed
        ? (parsed as { expectedRevision?: unknown }).expectedRevision
        : undefined;
    if (
      expectedRevision !== undefined &&
      (typeof expectedRevision !== 'number' ||
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0)
    ) {
      throw new TypeError('Invalid recovery journal revision.');
    }
    return {
      document: validateDiagramDocument(parsed.document),
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    };
  } catch {
    try {
      storage.removeItem(RECOVERY_JOURNAL_KEY);
    } catch {
      // An unavailable journal is equivalent to no recovery record.
    }
    return undefined;
  }
}

export function clearRecoveryJournal(
  savedDocument?: DiagramDocumentV1,
  storage: RecoveryStorage = localStorage,
): void {
  try {
    if (savedDocument !== undefined) {
      const pending = readRecoveryJournal(storage);
      if (pending === undefined || !samePendingContent(pending.document, savedDocument)) return;
    }
    storage.removeItem(RECOVERY_JOURNAL_KEY);
  } catch {
    // Recovery storage is best-effort and must never interrupt editor work.
  }
}
