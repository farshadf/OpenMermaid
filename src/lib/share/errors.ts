export type ShareCodecErrorCode =
  | 'missing_fragment'
  | 'unsupported_version'
  | 'malformed_fragment'
  | 'compressed_too_large'
  | 'decompressed_too_large'
  | 'source_too_large'
  | 'url_too_large';

export class ShareCodecError extends Error {
  readonly code: ShareCodecErrorCode;
  override readonly cause: unknown;

  constructor(code: ShareCodecErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ShareCodecError';
    this.code = code;
    this.cause = cause;
  }
}
