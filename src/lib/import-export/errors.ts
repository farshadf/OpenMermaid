export type DiagramImportErrorCode =
  | 'unsupported_file_type'
  | 'file_too_large'
  | 'missing_mermaid_fence'
  | 'source_too_large'
  | 'file_read_failed';

export class DiagramImportError extends Error {
  readonly code: DiagramImportErrorCode;
  override readonly cause: unknown;

  constructor(code: DiagramImportErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DiagramImportError';
    this.code = code;
    this.cause = cause;
  }
}
