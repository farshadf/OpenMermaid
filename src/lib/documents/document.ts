import {
  DIAGRAM_DOCUMENT_SCHEMA_VERSION,
  type DiagramAppearance,
  type DiagramDocumentPatch,
  type DiagramDocumentV1,
  type ShareEnvelopeV1,
} from './contracts';
import { DEFAULT_APPEARANCE, DEFAULT_DOCUMENT_TITLE, MERMAID_VERSION } from './constants';
import { validateDiagramDocument, validateShareEnvelope } from './validation';

export interface CreateDiagramDocumentOptions {
  id?: string;
  title?: string;
  source?: string;
  appearance?: DiagramAppearance;
  createdWithMermaid?: string;
  now?: string;
}

function generateDocumentId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const random = Math.random().toString(36).slice(2);
  return `document-${Date.now().toString(36)}-${random}`;
}

export function createDiagramDocument(
  options: CreateDiagramDocumentOptions = {},
): DiagramDocumentV1 {
  const now = options.now ?? new Date().toISOString();
  return validateDiagramDocument({
    schemaVersion: DIAGRAM_DOCUMENT_SCHEMA_VERSION,
    id: options.id ?? generateDocumentId(),
    title: options.title ?? DEFAULT_DOCUMENT_TITLE,
    source: options.source ?? '',
    createdWithMermaid: options.createdWithMermaid ?? MERMAID_VERSION,
    appearance: options.appearance ?? DEFAULT_APPEARANCE,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export function updateDiagramDocument(
  document: DiagramDocumentV1,
  patch: DiagramDocumentPatch,
  now = new Date().toISOString(),
): DiagramDocumentV1 {
  const current = validateDiagramDocument(document);
  return validateDiagramDocument({
    ...current,
    ...patch,
    appearance: patch.appearance ?? current.appearance,
    revision: current.revision + 1,
    updatedAt: now,
  });
}

export function documentToShareEnvelope(document: DiagramDocumentV1): ShareEnvelopeV1 {
  const current = validateDiagramDocument(document);
  return validateShareEnvelope({
    version: 1,
    title: current.title,
    source: current.source,
    createdWithMermaid: current.createdWithMermaid,
    appearance: current.appearance,
  });
}

export function shareEnvelopeToDocument(
  envelope: ShareEnvelopeV1,
  options: Pick<CreateDiagramDocumentOptions, 'id' | 'now'> = {},
): DiagramDocumentV1 {
  const shared = validateShareEnvelope(envelope);
  return createDiagramDocument({
    ...options,
    ...(shared.title === undefined ? {} : { title: shared.title }),
    source: shared.source,
    createdWithMermaid: shared.createdWithMermaid,
    appearance: shared.appearance,
  });
}
