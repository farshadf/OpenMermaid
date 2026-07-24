import type { DiagramDocumentV1 } from '../documents';

export class RevisionConflictError extends Error {
  readonly incomingRevision: number;
  readonly storedRevision: number;
  readonly storedDocument: DiagramDocumentV1;

  constructor(incoming: DiagramDocumentV1, stored: DiagramDocumentV1) {
    super(
      `Document revision conflict: received ${String(incoming.revision)}, expected ${String(stored.revision + 1)}.`,
    );
    this.name = 'RevisionConflictError';
    this.incomingRevision = incoming.revision;
    this.storedRevision = stored.revision;
    this.storedDocument = stored;
  }
}

export type StorageErrorCode = 'unavailable' | 'quota_exceeded' | 'operation_failed';

export class DiagramStorageError extends Error {
  readonly code: StorageErrorCode;
  override readonly cause: unknown;

  constructor(code: StorageErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DiagramStorageError';
    this.code = code;
    this.cause = cause;
  }
}

export function normalizeStorageError(error: unknown): DiagramStorageError {
  if (error instanceof DiagramStorageError) return error;

  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new DiagramStorageError(
      'quota_exceeded',
      'Local storage is full. Export your work, then free browser storage and retry.',
      error,
    );
  }

  if (
    error instanceof DOMException &&
    ['InvalidStateError', 'NotAllowedError', 'SecurityError', 'UnknownError'].includes(error.name)
  ) {
    return new DiagramStorageError(
      'unavailable',
      'Local storage is unavailable. Your current source can still be exported.',
      error,
    );
  }

  return new DiagramStorageError(
    'operation_failed',
    'The local document operation failed. Your current source can still be exported.',
    error,
  );
}
