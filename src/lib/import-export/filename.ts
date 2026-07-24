const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const UNSAFE_FILENAME_CHARACTERS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
const MAX_FILENAME_STEM_CODEPOINTS = 80;

export type SourceFileExtension = 'mmd' | 'mermaid' | 'txt';

function cleanFilenameStem(value: string): string {
  const safeCharacters = Array.from(value.normalize('NFKC'), (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 || UNSAFE_FILENAME_CHARACTERS.has(character)
      ? ' '
      : character;
  }).join('');
  const normalized = safeCharacters.replace(/\s+/gu, ' ').replace(/^[ .]+|[ .]+$/gu, '');
  return Array.from(normalized).slice(0, MAX_FILENAME_STEM_CODEPOINTS).join('').trim();
}

export function sanitizeFilenameStem(value: string, fallback = 'diagram'): string {
  const cleaned = cleanFilenameStem(value);
  const cleanedFallback = cleanFilenameStem(fallback);
  const candidate = cleaned || cleanedFallback || 'diagram';
  return WINDOWS_RESERVED_NAMES.test(candidate) ? `_${candidate}` : candidate;
}

export function sourceFilename(title: string, extension: SourceFileExtension = 'mmd'): string {
  return `${sanitizeFilenameStem(title)}.${extension}`;
}

export function sanitizeDownloadFilename(value: string, fallback = 'diagram.mmd'): string {
  const leaf = value.split(/[\\/]/u).at(-1) ?? value;
  const extensionMatch = /(\.[A-Za-z0-9]{1,10})$/u.exec(leaf);
  const extension = extensionMatch?.[1] ?? '';
  const rawStem = extension.length === 0 ? leaf : leaf.slice(0, -extension.length);
  const fallbackStem = fallback.replace(/\.[A-Za-z0-9]{1,10}$/u, '');
  return `${sanitizeFilenameStem(rawStem, fallbackStem)}${extension}`;
}

export function titleFromFilename(filename: string): string {
  const leaf = filename.split(/[\\/]/u).at(-1) ?? filename;
  const withoutExtension = leaf.replace(/\.(?:mmd|mermaid|txt|md)$/iu, '');
  return sanitizeFilenameStem(withoutExtension, 'Imported diagram');
}
