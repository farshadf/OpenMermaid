import type { DiagramAppearance } from './contracts';

export const MERMAID_VERSION = '11.16.0';
export const MAX_DOCUMENT_ID_LENGTH = 128;
export const MAX_DOCUMENT_TITLE_LENGTH = 200;
export const MAX_DOCUMENT_SOURCE_LENGTH = 50_000;
export const MAX_MERMAID_VERSION_LENGTH = 64;

export const DEFAULT_APPEARANCE: Readonly<DiagramAppearance> = Object.freeze({
  theme: 'default',
  background: 'transparent',
});

export const DEFAULT_DOCUMENT_TITLE = 'Untitled diagram';
