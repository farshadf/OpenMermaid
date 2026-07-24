import {
  createSourceDownload,
  extractMermaidFence,
  importDiagramText,
  sanitizeDownloadFilename,
  sanitizeFilenameStem,
  sourceFilename,
  titleFromFilename,
} from '@lib/import-export';
import { createDiagramDocument } from '@lib/documents';
import { describe, expect, it } from 'vitest';

describe('diagram import and source export', () => {
  it('imports Mermaid source files and removes a UTF-8 BOM', () => {
    expect(
      importDiagramText({
        filename: 'Checkout flow.mmd',
        text: '\uFEFFflowchart LR\n  Cart --> Payment',
        mimeType: 'text/plain',
      }),
    ).toMatchObject({
      title: 'Checkout flow',
      source: 'flowchart LR\n  Cart --> Payment',
      format: 'mermaid',
      normalization: {
        changed: true,
        wrapper: 'none',
      },
    });
  });

  it('extracts the first complete backtick or tilde Mermaid fence', () => {
    const markdown =
      '# Architecture\r\n\r\n~~~mermaid\r\nsequenceDiagram\r\n  A->>B: Hi 👋\r\n~~~~\r\n';
    expect(extractMermaidFence(markdown)).toBe('sequenceDiagram\n  A->>B: Hi 👋');
    expect(importDiagramText({ filename: 'architecture.md', text: markdown })).toMatchObject({
      title: 'architecture',
      format: 'markdown-fence',
    });
  });

  it('rejects Markdown without an identifiable Mermaid fence and unknown file types', () => {
    expect(() => importDiagramText({ filename: 'notes.md', text: '```js\nalert(1)\n```' })).toThrow(
      expect.objectContaining({ code: 'missing_mermaid_fence' }),
    );
    expect(() =>
      importDiagramText({
        filename: 'diagram.svg',
        text: '<svg></svg>',
        mimeType: 'image/svg+xml',
      }),
    ).toThrow(expect.objectContaining({ code: 'unsupported_file_type' }));
    expect(() => importDiagramText({ filename: 'diagram.svg', text: '<svg></svg>' })).toThrow(
      expect.objectContaining({ code: 'unsupported_file_type' }),
    );
  });

  it('enforces the source length after extracting Markdown', () => {
    expect(() =>
      importDiagramText({
        filename: 'large.md',
        text: `\`\`\`mermaid\n${'x'.repeat(50_001)}\n\`\`\``,
      }),
    ).toThrow(expect.objectContaining({ code: 'source_too_large' }));
  });

  it('normalizes safe cross-platform filenames and reserved device names', () => {
    expect(sanitizeFilenameStem('  API / deploy:* plan  ')).toBe('API deploy plan');
    expect(sanitizeFilenameStem('CON')).toBe('_CON');
    expect(sourceFilename('My diagram', 'mermaid')).toBe('My diagram.mermaid');
    expect(sanitizeDownloadFilename('../CON.mmd')).toBe('_CON.mmd');
    expect(titleFromFilename('../work/日本語 flow.mmd')).toBe('日本語 flow');
    expect(sourceFilename(''.padEnd(100, 'a'))).toBe(`${'a'.repeat(80)}.mmd`);
  });

  it('creates a plain-text source download from a validated document', () => {
    const document = createDiagramDocument({
      id: 'download',
      title: 'API / flow',
      source: 'sequenceDiagram\n  Client->>API: GET',
      now: '2026-07-21T10:00:00.000Z',
    });
    const result = createSourceDownload(document);
    expect(result.filename).toBe('API flow.mmd');
    expect(result.blob.type).toBe('text/plain;charset=utf-8');
    expect(result.blob.size).toBeGreaterThan(0);
  });
});
