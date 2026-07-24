export const DIAGRAM_DOCUMENT_SCHEMA_VERSION = 1 as const;

export const DIAGRAM_THEMES = ['default', 'neutral', 'dark', 'forest'] as const;
export const DIAGRAM_BACKGROUNDS = ['transparent', 'light', 'dark'] as const;

export type DiagramTheme = (typeof DIAGRAM_THEMES)[number];
export type DiagramBackground = (typeof DIAGRAM_BACKGROUNDS)[number];

export interface DiagramAppearance {
  theme: DiagramTheme;
  background: DiagramBackground;
}

export interface DiagramDocumentV1 {
  schemaVersion: typeof DIAGRAM_DOCUMENT_SCHEMA_VERSION;
  id: string;
  title: string;
  source: string;
  createdWithMermaid: string;
  appearance: DiagramAppearance;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShareEnvelopeV1 {
  version: 1;
  title?: string;
  source: string;
  createdWithMermaid: string;
  appearance: DiagramAppearance;
}

export interface DiagramRepository {
  list(): Promise<DiagramDocumentV1[]>;
  get(id: string): Promise<DiagramDocumentV1 | undefined>;
  put(document: DiagramDocumentV1): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface EditorHostCapabilities {
  publishDocument: boolean;
  fullscreen: boolean;
  externalNavigation: boolean;
  fileUpload: boolean;
}

export interface EditorHostBridge {
  capabilities: EditorHostCapabilities;
  publishDocument?(document: DiagramDocumentV1): Promise<void>;
}

export type DiagramDocumentPatch = Partial<
  Pick<DiagramDocumentV1, 'title' | 'source' | 'appearance'>
>;
