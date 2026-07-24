export type DocumentValidationIssue =
  | 'not_an_object'
  | 'unsupported_version'
  | 'invalid_id'
  | 'invalid_title'
  | 'invalid_source'
  | 'source_too_large'
  | 'invalid_mermaid_version'
  | 'invalid_appearance'
  | 'invalid_revision'
  | 'invalid_timestamp'
  | 'unexpected_property';

export class DocumentValidationError extends Error {
  readonly issue: DocumentValidationIssue;

  constructor(issue: DocumentValidationIssue, message: string) {
    super(message);
    this.name = 'DocumentValidationError';
    this.issue = issue;
  }
}
