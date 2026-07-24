import { DIAGRAM_DOCUMENT_SCHEMA_VERSION, type DiagramDocumentV1 } from './contracts';
import { DEFAULT_APPEARANCE, MERMAID_VERSION } from './constants';
import { DocumentValidationError } from './errors';
import {
  isRecord,
  validateDiagramAppearance,
  validateDiagramDocument,
  validateDocumentId,
  validateDocumentSource,
  validateDocumentTitle,
  validateIsoTimestamp,
  validateMermaidVersion,
  validateRevision,
} from './validation';

export interface MigrationOptions {
  fallbackMermaidVersion?: string;
  now?: string;
}

/**
 * Migrates persisted pre-release documents that predate schemaVersion. These
 * records used `name`, `content`, `theme`, and `background` at the top level.
 */
export function migrateDiagramDocument(
  value: unknown,
  options: MigrationOptions = {},
): DiagramDocumentV1 {
  if (!isRecord(value)) {
    throw new DocumentValidationError('not_an_object', 'The document must be an object.');
  }

  if (value.schemaVersion === DIAGRAM_DOCUMENT_SCHEMA_VERSION) {
    return validateDiagramDocument(value);
  }

  if (value.schemaVersion !== undefined) {
    throw new DocumentValidationError(
      'unsupported_version',
      'This document was created with an unsupported schema version.',
    );
  }

  const now = validateIsoTimestamp(options.now ?? new Date().toISOString());
  const createdAt = validateIsoTimestamp(value.createdAt ?? now);
  const updatedAt = validateIsoTimestamp(value.updatedAt ?? createdAt);
  const appearance =
    value.appearance !== undefined
      ? validateDiagramAppearance(value.appearance)
      : validateDiagramAppearance({
          theme: value.theme ?? DEFAULT_APPEARANCE.theme,
          background: value.background ?? DEFAULT_APPEARANCE.background,
        });

  return validateDiagramDocument({
    schemaVersion: DIAGRAM_DOCUMENT_SCHEMA_VERSION,
    id: validateDocumentId(value.id),
    title: validateDocumentTitle(value.title ?? value.name ?? ''),
    source: validateDocumentSource(value.source ?? value.content ?? ''),
    createdWithMermaid: validateMermaidVersion(
      value.createdWithMermaid ?? options.fallbackMermaidVersion ?? MERMAID_VERSION,
    ),
    appearance,
    revision: validateRevision(value.revision ?? 0),
    createdAt,
    updatedAt,
  });
}
