import {
  validateDiagramDocument,
  validateDocumentSource,
  type DiagramDocumentV1,
} from '../documents';
import { sanitizeDownloadFilename, sourceFilename, type SourceFileExtension } from './filename';

export interface SourceDownload {
  blob: Blob;
  filename: string;
}

export function createTextSourceDownload(
  source: string,
  title: string,
  extension: SourceFileExtension = 'mmd',
): SourceDownload {
  const validSource = validateDocumentSource(source);
  return {
    blob: new Blob([validSource], { type: 'text/plain;charset=utf-8' }),
    filename: sourceFilename(title, extension),
  };
}

export function createSourceDownload(
  document: DiagramDocumentV1,
  extension: SourceFileExtension = 'mmd',
): SourceDownload {
  const validDocument = validateDiagramDocument(document);
  return createTextSourceDownload(validDocument.source, validDocument.title, extension);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = sanitizeDownloadFilename(filename);
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
