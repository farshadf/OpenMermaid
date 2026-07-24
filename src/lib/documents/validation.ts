import {
  DIAGRAM_BACKGROUNDS,
  DIAGRAM_DOCUMENT_SCHEMA_VERSION,
  DIAGRAM_THEMES,
  type DiagramAppearance,
  type DiagramDocumentV1,
  type ShareEnvelopeV1,
} from './contracts';
import {
  MAX_DOCUMENT_ID_LENGTH,
  MAX_DOCUMENT_SOURCE_LENGTH,
  MAX_DOCUMENT_TITLE_LENGTH,
  MAX_MERMAID_VERSION_LENGTH,
} from './constants';
import { DocumentValidationError } from './errors';

type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: UnknownRecord,
  allowedKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new DocumentValidationError(
      'unexpected_property',
      `${label} contains an unexpected property.`,
    );
  }
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

export function validateDocumentId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > MAX_DOCUMENT_ID_LENGTH ||
    containsControlCharacter(value)
  ) {
    throw new DocumentValidationError('invalid_id', 'The document ID is invalid.');
  }

  return value;
}

export function validateDocumentTitle(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_DOCUMENT_TITLE_LENGTH) {
    throw new DocumentValidationError(
      'invalid_title',
      `The document title must be at most ${String(MAX_DOCUMENT_TITLE_LENGTH)} characters.`,
    );
  }

  return value;
}

export function validateDocumentSource(value: unknown): string {
  if (typeof value !== 'string') {
    throw new DocumentValidationError('invalid_source', 'The diagram source must be text.');
  }

  if (value.length > MAX_DOCUMENT_SOURCE_LENGTH) {
    throw new DocumentValidationError(
      'source_too_large',
      `Diagram source is limited to ${String(MAX_DOCUMENT_SOURCE_LENGTH)} characters.`,
    );
  }

  return value;
}

export function validateMermaidVersion(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > MAX_MERMAID_VERSION_LENGTH ||
    containsControlCharacter(value)
  ) {
    throw new DocumentValidationError('invalid_mermaid_version', 'The Mermaid version is invalid.');
  }

  return value;
}

export function validateDiagramAppearance(value: unknown): DiagramAppearance {
  if (!isRecord(value)) {
    throw new DocumentValidationError('invalid_appearance', 'Diagram appearance is invalid.');
  }
  assertExactKeys(value, ['theme', 'background'], 'Diagram appearance');

  const { theme, background } = value;
  if (
    typeof theme !== 'string' ||
    !DIAGRAM_THEMES.includes(theme as DiagramAppearance['theme']) ||
    typeof background !== 'string' ||
    !DIAGRAM_BACKGROUNDS.includes(background as DiagramAppearance['background'])
  ) {
    throw new DocumentValidationError('invalid_appearance', 'Diagram appearance is invalid.');
  }

  return {
    theme: theme as DiagramAppearance['theme'],
    background: background as DiagramAppearance['background'],
  };
}

export function validateRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new DocumentValidationError(
      'invalid_revision',
      'The document revision must be a non-negative safe integer.',
    );
  }

  return value as number;
}

export function validateIsoTimestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DocumentValidationError('invalid_timestamp', 'The document timestamp is invalid.');
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new DocumentValidationError(
      'invalid_timestamp',
      'The document timestamp must be a canonical ISO 8601 UTC value.',
    );
  }

  return value;
}

export function validateDiagramDocument(value: unknown): DiagramDocumentV1 {
  if (!isRecord(value)) {
    throw new DocumentValidationError('not_an_object', 'The document must be an object.');
  }

  assertExactKeys(
    value,
    [
      'schemaVersion',
      'id',
      'title',
      'source',
      'createdWithMermaid',
      'appearance',
      'revision',
      'createdAt',
      'updatedAt',
    ],
    'Diagram document',
  );

  if (value.schemaVersion !== DIAGRAM_DOCUMENT_SCHEMA_VERSION) {
    throw new DocumentValidationError(
      'unsupported_version',
      'This document was created with an unsupported schema version.',
    );
  }

  const createdAt = validateIsoTimestamp(value.createdAt);
  const updatedAt = validateIsoTimestamp(value.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new DocumentValidationError(
      'invalid_timestamp',
      'The updated timestamp cannot precede the created timestamp.',
    );
  }

  return {
    schemaVersion: DIAGRAM_DOCUMENT_SCHEMA_VERSION,
    id: validateDocumentId(value.id),
    title: validateDocumentTitle(value.title),
    source: validateDocumentSource(value.source),
    createdWithMermaid: validateMermaidVersion(value.createdWithMermaid),
    appearance: validateDiagramAppearance(value.appearance),
    revision: validateRevision(value.revision),
    createdAt,
    updatedAt,
  };
}

export function validateShareEnvelope(value: unknown): ShareEnvelopeV1 {
  if (!isRecord(value)) {
    throw new DocumentValidationError('not_an_object', 'The shared diagram must be an object.');
  }
  assertExactKeys(
    value,
    ['version', 'title', 'source', 'createdWithMermaid', 'appearance'],
    'Shared diagram',
  );

  if (value.version !== 1) {
    throw new DocumentValidationError(
      'unsupported_version',
      'This shared diagram uses an unsupported version.',
    );
  }

  const envelope: ShareEnvelopeV1 = {
    version: 1,
    source: validateDocumentSource(value.source),
    createdWithMermaid: validateMermaidVersion(value.createdWithMermaid),
    appearance: validateDiagramAppearance(value.appearance),
  };

  if (value.title !== undefined) {
    envelope.title = validateDocumentTitle(value.title);
  }

  return envelope;
}
