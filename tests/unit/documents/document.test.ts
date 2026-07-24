import {
  createDiagramDocument,
  createStandaloneEditorHostBridge,
  documentToShareEnvelope,
  migrateDiagramDocument,
  shareEnvelopeToDocument,
  updateDiagramDocument,
  validateDiagramDocument,
} from '@lib/documents';
import { describe, expect, it } from 'vitest';

const CREATED_AT = '2026-07-21T10:00:00.000Z';
const UPDATED_AT = '2026-07-21T10:01:00.000Z';

describe('diagram documents', () => {
  it('creates, updates, and shares a Unicode document without losing content', () => {
    const created = createDiagramDocument({
      id: 'unicode-document',
      title: 'Déploiement 日本語',
      source: 'flowchart LR\n  A["مرحبا 👋"] --> B["café"]',
      now: CREATED_AT,
    });

    expect(created.revision).toBe(0);
    const updated = updateDiagramDocument(created, { title: 'Updated diagram' }, UPDATED_AT);
    expect(updated).toMatchObject({ revision: 1, updatedAt: UPDATED_AT });
    expect(created.title).toBe('Déploiement 日本語');

    const envelope = documentToShareEnvelope(updated);
    const imported = shareEnvelopeToDocument(envelope, {
      id: 'shared-document',
      now: UPDATED_AT,
    });
    expect(imported).toMatchObject({
      id: 'shared-document',
      title: 'Updated diagram',
      source: created.source,
      revision: 0,
    });
  });

  it('migrates the unversioned pre-release document shape', () => {
    expect(
      migrateDiagramDocument({
        id: 'legacy',
        name: 'Legacy flow',
        content: 'graph TD\n  A --> B',
        theme: 'forest',
        background: 'light',
        revision: 3,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      }),
    ).toEqual({
      schemaVersion: 1,
      id: 'legacy',
      title: 'Legacy flow',
      source: 'graph TD\n  A --> B',
      createdWithMermaid: '11.16.0',
      appearance: { theme: 'forest', background: 'light' },
      revision: 3,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
  });

  it('rejects future versions and invalid timestamps', () => {
    expect(() => migrateDiagramDocument({ schemaVersion: 2 })).toThrow(
      expect.objectContaining({ issue: 'unsupported_version' }),
    );

    const document = createDiagramDocument({ id: 'bad-time', now: UPDATED_AT });
    expect(() =>
      validateDiagramDocument({ ...document, createdAt: UPDATED_AT, updatedAt: CREATED_AT }),
    ).toThrow(expect.objectContaining({ issue: 'invalid_timestamp' }));
    expect(() => validateDiagramDocument({ ...document, updatedAt: 'July 21, 2026' })).toThrow(
      expect.objectContaining({ issue: 'invalid_timestamp' }),
    );
  });

  it('enforces the Mermaid source limit', () => {
    expect(() =>
      createDiagramDocument({ id: 'oversized', source: 'x'.repeat(50_001), now: CREATED_AT }),
    ).toThrow(expect.objectContaining({ issue: 'source_too_large' }));
  });

  it('provides an independent host bridge with no publish capability', () => {
    expect(createStandaloneEditorHostBridge()).toEqual({
      capabilities: {
        publishDocument: false,
        fullscreen: true,
        externalNavigation: true,
        fileUpload: true,
      },
    });
  });
});
