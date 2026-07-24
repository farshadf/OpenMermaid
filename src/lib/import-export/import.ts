import { MAX_DOCUMENT_SOURCE_LENGTH, validateDocumentSource } from '../documents';
import { DiagramImportError } from './errors';
import { titleFromFilename } from './filename';
import {
  extractNormalizedMermaidFence,
  normalizeMermaidSource,
  type MermaidSourceNormalizationReport,
} from './normalization';

export const MAX_IMPORT_FILE_BYTES = 1_048_576;

export type DiagramImportFormat = 'mermaid' | 'plain-text' | 'markdown-fence';

export interface DiagramTextImport {
  filename: string;
  text: string;
  mimeType?: string;
}

export interface ImportedDiagramSource {
  title: string;
  source: string;
  format: DiagramImportFormat;
  normalization: MermaidSourceNormalizationReport;
}

function extensionOf(filename: string): string {
  const match = /\.([^.]+)$/u.exec(filename.trim());
  return match?.[1]?.toLocaleLowerCase() ?? '';
}

export function extractMermaidFence(markdown: string): string | undefined {
  return extractNormalizedMermaidFence(markdown.replace(/\r\n?|\u0085|[\u2028\u2029]/gu, '\n'));
}

export function importDiagramText(input: DiagramTextImport): ImportedDiagramSource {
  const byteLength = new TextEncoder().encode(input.text).length;
  if (byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new DiagramImportError(
      'file_too_large',
      'The selected file exceeds the 1 MiB import safety limit.',
    );
  }

  const extension = extensionOf(input.filename);
  const isMarkdown = extension === 'md' || input.mimeType === 'text/markdown';
  const isMermaid = extension === 'mmd' || extension === 'mermaid';
  const isPlainText =
    extension === 'txt' ||
    (extension === '' &&
      (input.mimeType === 'text/plain' || input.mimeType === undefined || input.mimeType === ''));
  if (!isMarkdown && !isMermaid && !isPlainText) {
    throw new DiagramImportError(
      'unsupported_file_type',
      'Choose a .mmd, .mermaid, .txt, or Mermaid-fenced Markdown file.',
    );
  }

  const normalized = normalizeMermaidSource(input.text);
  const extractedFence = normalized.report.wrappers.includes('markdown-fence');
  if (isMarkdown && !extractedFence) {
    throw new DiagramImportError(
      'missing_mermaid_fence',
      'The Markdown file does not contain a complete mermaid code fence.',
    );
  }
  const source = normalized.source;
  if (source.length > MAX_DOCUMENT_SOURCE_LENGTH) {
    throw new DiagramImportError(
      'source_too_large',
      `Imported diagram source is limited to ${String(MAX_DOCUMENT_SOURCE_LENGTH)} characters.`,
    );
  }

  try {
    validateDocumentSource(source);
  } catch (error) {
    throw new DiagramImportError('source_too_large', 'The imported source is too large.', error);
  }

  return {
    title: titleFromFilename(input.filename),
    source,
    format: extractedFence ? 'markdown-fence' : isMermaid ? 'mermaid' : 'plain-text',
    normalization: normalized.report,
  };
}

export async function importDiagramFile(file: File): Promise<ImportedDiagramSource> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new DiagramImportError(
      'file_too_large',
      'The selected file exceeds the 1 MiB import safety limit.',
    );
  }

  try {
    return importDiagramText({ filename: file.name, text: await file.text(), mimeType: file.type });
  } catch (error) {
    if (error instanceof DiagramImportError) throw error;
    throw new DiagramImportError('file_read_failed', 'The selected file could not be read.', error);
  }
}
