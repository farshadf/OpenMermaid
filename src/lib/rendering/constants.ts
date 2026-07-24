export const RENDERER_PROTOCOL_CHANNEL = 'openmermaid:renderer' as const;
export const RENDERER_PROTOCOL_VERSION = 1 as const;

export const MAX_MERMAID_SOURCE_LENGTH = 50_000;
export const DEFAULT_RENDER_TIMEOUT_MS = 20_000;
export const MIN_RENDER_TIMEOUT_MS = 1_000;
export const MAX_RENDER_TIMEOUT_MS = 30_000;

export const MAX_SVG_BYTES = 2_000_000;
export const MAX_PNG_DIMENSION = 16_384;
export const MAX_PNG_PIXELS = 40_000_000;

export const MERMAID_SECURE_KEYS = Object.freeze([
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges',
] as const);

export const ALLOWED_MERMAID_THEMES = Object.freeze([
  'default',
  'neutral',
  'dark',
  'forest',
] as const);

export type MermaidTheme = (typeof ALLOWED_MERMAID_THEMES)[number];

export const PNG_BACKGROUNDS = Object.freeze({
  transparent: null,
  light: '#ffffff',
  dark: '#0b1020',
} as const);

export type PngBackground = keyof typeof PNG_BACKGROUNDS;
export type PngScale = 1 | 2 | 3;
