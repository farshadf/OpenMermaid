import { mermaidDirectiveKeywords } from '../mermaid-language/directives';

/**
 * Normalization is deliberately bounded independently from the 50,000-character
 * document limit. A pasted wrapper may be larger than the Mermaid source it
 * contains, but it must never become an unbounded preprocessing workload.
 */
export const MAX_MERMAID_NORMALIZATION_INPUT_LENGTH = 1_048_576;

export type MermaidSourceNormalizationChangeCode =
  | 'ansi-escape'
  | 'bare-language-marker'
  | 'byte-order-mark'
  | 'common-indentation'
  | 'control-character'
  | 'diff-prefix'
  | 'escaped-line-break'
  | 'html-code-wrapper'
  | 'json-string-wrapper'
  | 'json-object-wrapper'
  | 'line-ending'
  | 'line-number-prefix'
  | 'markdown-blockquote-prefix'
  | 'markdown-fence-wrapper'
  | 'markdown-list-prefix'
  | 'non-breaking-space'
  | 'outer-blank-lines'
  | 'prose-prefix'
  | 'structural-html-entity'
  | 'structural-smart-dash'
  | 'terminal-gutter-prefix'
  | 'unicode-line-separator'
  | 'zero-width-formatting';

export type MermaidSourceNormalizationWarningCode =
  | 'incomplete-mermaid-fence'
  | 'multiple-mermaid-blocks'
  | 'suspicious-formatting-control'
  | 'unrecognized-html-wrapper'
  | 'unicode-arrow-left-unchanged';

export type MermaidSourceWrapper =
  'none' | 'markdown-fence' | 'html-code' | 'json-string' | 'json-object' | 'combined';

export interface MermaidSourceNormalizationChange {
  readonly code: MermaidSourceNormalizationChangeCode;
  readonly count: number;
}

export interface MermaidSourceNormalizationWarning {
  readonly code: MermaidSourceNormalizationWarningCode;
  readonly count: number;
}

export interface MermaidSourceNormalizationReport {
  readonly changed: boolean;
  readonly wrapper: MermaidSourceWrapper;
  readonly wrappers: readonly Exclude<MermaidSourceWrapper, 'none' | 'combined'>[];
  readonly originalLength: number;
  readonly normalizedLength: number;
  readonly changes: readonly MermaidSourceNormalizationChange[];
  readonly warnings: readonly MermaidSourceNormalizationWarning[];
}

export interface NormalizedMermaidSource {
  readonly source: string;
  readonly report: MermaidSourceNormalizationReport;
}

export class MermaidSourceNormalizationError extends Error {
  readonly code = 'input_too_large' as const;

  constructor(message: string) {
    super(message);
    this.name = 'MermaidSourceNormalizationError';
  }
}

interface MutableReport {
  readonly originalLength: number;
  readonly changes: Map<MermaidSourceNormalizationChangeCode, number>;
  readonly warnings: Map<MermaidSourceNormalizationWarningCode, number>;
  readonly wrappers: Set<Exclude<MermaidSourceWrapper, 'none' | 'combined'>>;
}

interface FenceCandidate {
  readonly body: string;
  readonly complete: boolean;
  readonly explicitlyMermaid: boolean;
}

const EXTRA_DIRECTIVES = [
  'graph',
  'C4Context',
  'C4Container',
  'C4Component',
  'C4Dynamic',
  'C4Deployment',
] as const;

const KNOWN_DIRECTIVES = new Set(
  [...mermaidDirectiveKeywords, ...EXTRA_DIRECTIVES]
    .filter((directive) => directive !== '---')
    .map((directive) => directive.toLocaleLowerCase('en-US')),
);

const MERMAID_INFO_PATTERN = /^(?:mermaid|mmd|language-mermaid)(?:\s|$)/iu;
const MERMAID_ATTRIBUTE_PATTERN = /^\{\s*\.(?:mermaid|mmd)(?:\s|\}|$)/iu;
const ZERO_WIDTH_FORMATTING_PATTERN = /\u200B|\u200C|\u200D|\u2060/gu;
const UNICODE_ARROW_PATTERN = /[←↑→↓↔↕⇐⇒⇔⟵⟶⟷]/gu;

function increment<K extends string>(map: Map<K, number>, code: K, count = 1): void {
  if (count <= 0) return;
  map.set(code, (map.get(code) ?? 0) + count);
}

function replaceCounted(
  value: string,
  pattern: RegExp,
  replacement: string | ((substring: string) => string),
): { readonly value: string; readonly count: number } {
  let count = 0;
  const next = value.replace(pattern, (substring: string) => {
    count += 1;
    return typeof replacement === 'string' ? replacement : replacement(substring);
  });
  return { value: next, count };
}

function firstMeaningfulLine(source: string): string | undefined {
  const lines = source.split('\n');
  let inFrontmatter = false;
  let sawFrontmatterStart = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (!sawFrontmatterStart && line === '---') {
      sawFrontmatterStart = true;
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line === '---') inFrontmatter = false;
      continue;
    }
    return line;
  }
  return undefined;
}

export function looksLikeMermaidSource(source: string): boolean {
  const line = firstMeaningfulLine(source);
  if (line === undefined) return false;
  const directive = /^([A-Za-z][\w-]*)\b/u.exec(line)?.[1];
  return directive !== undefined && KNOWN_DIRECTIVES.has(directive.toLocaleLowerCase('en-US'));
}

function isMermaidFenceInfo(info: string): boolean {
  const normalized = info.trim();
  return MERMAID_INFO_PATTERN.test(normalized) || MERMAID_ATTRIBUTE_PATTERN.test(normalized);
}

function findFenceCandidates(markdown: string): readonly FenceCandidate[] {
  const lines = markdown.split('\n');
  const candidates: FenceCandidate[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opening = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/u.exec(lines[index] ?? '');
    const marker = opening?.[1];
    if (marker === undefined) continue;

    const info = (opening?.[2] ?? '').trim();
    const explicitlyMermaid = isMermaidFenceInfo(info);
    const body: string[] = [];
    let complete = false;
    let closingIndex = index;

    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
      const closing = /^ {0,3}(`+|~+)[ \t]*$/u.exec(lines[bodyIndex] ?? '');
      const closingMarker = closing?.[1];
      if (
        closingMarker?.startsWith(marker.slice(0, 1)) === true &&
        closingMarker.length >= marker.length
      ) {
        complete = true;
        closingIndex = bodyIndex;
        break;
      }
      body.push(lines[bodyIndex] ?? '');
      closingIndex = bodyIndex;
    }

    const bodySource = body.join('\n');
    if (explicitlyMermaid || (info.length === 0 && looksLikeMermaidSource(bodySource))) {
      candidates.push({ body: bodySource, complete, explicitlyMermaid });
    }

    if (complete) index = closingIndex;
    // An unclosed Markdown fence consumes the remainder of the document. More
    // importantly, stopping here keeps hostile input containing thousands of
    // fake openings linear instead of repeatedly scanning to EOF.
    else break;
  }

  return candidates;
}

/**
 * Returns a complete, confidently identified Mermaid fence. This compatibility
 * helper intentionally does not recover an incomplete fence; the richer
 * normalizer reports that recovery explicitly.
 */
export function extractNormalizedMermaidFence(markdown: string): string | undefined {
  return findFenceCandidates(markdown).find(({ complete }) => complete)?.body;
}

function decodeHtmlText(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/giu, (entity, name: string) => {
    if (!name.startsWith('#')) return named[name.toLocaleLowerCase('en-US')] ?? entity;
    const hexadecimal = name.charAt(1).toLocaleLowerCase('en-US') === 'x';
    const rawNumber = name.slice(hexadecimal ? 2 : 1);
    const codePoint = Number.parseInt(rawNumber, hexadecimal ? 16 : 10);
    if (
      !Number.isSafeInteger(codePoint) ||
      codePoint < 0 ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return entity;
    }
    return String.fromCodePoint(codePoint);
  });
}

function unwrapHtmlCode(value: string): { readonly source: string; readonly matched: boolean } {
  const trimmed = value.trim();
  const match = /^(?:<pre\b[^>]*>\s*)?<code\b([^>]*)>([\s\S]*?)<\/code>(?:\s*<\/pre>)?$/iu.exec(
    trimmed,
  );
  if (match === null) return { source: value, matched: false };

  const attributes = match[1] ?? '';
  const encodedBody = match[2] ?? '';
  // Syntax highlighters often inject spans. Removing arbitrary markup would be
  // guesswork, so only a text-only code element is normalized automatically.
  if (/<[A-Za-z!/]/u.test(encodedBody)) return { source: value, matched: false };

  const decoded = decodeHtmlText(encodedBody);
  const labeled = /(?:language-|lang(?:uage)?[=\s"']+)(?:mermaid|mmd)\b/iu.test(attributes);
  if (!labeled && !looksLikeMermaidSource(decoded) && findFenceCandidates(decoded).length === 0) {
    return { source: value, matched: false };
  }
  return { source: decoded, matched: true };
}

function stripConsistentBlockquote(
  value: string,
): { readonly source: string; readonly levels: number } | undefined {
  let source = value;
  let levels = 0;
  while (levels < 4) {
    const lines = source.split('\n');
    const nonEmpty = lines.filter((line) => line.trim().length > 0);
    if (nonEmpty.length === 0 || !nonEmpty.every((line) => /^\s*> ?/u.test(line))) break;
    source = lines.map((line) => line.replace(/^(\s*)> ?/u, '$1')).join('\n');
    levels += 1;
  }
  if (
    levels === 0 ||
    (!looksLikeMermaidSource(source) && findFenceCandidates(source).length === 0)
  ) {
    return undefined;
  }
  return { source, levels };
}

function stripConsistentPrefix(value: string, pattern: RegExp): string | undefined {
  const lines = value.split('\n');
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length < 2 || !nonEmpty.every((line) => pattern.test(line))) return undefined;
  const stripped = lines.map((line) => line.replace(pattern, '$1')).join('\n');
  return looksLikeMermaidSource(stripped) || findFenceCandidates(stripped).length > 0
    ? stripped
    : undefined;
}

function stripConsistentLineNumbers(value: string): string | undefined {
  const lines = value.split('\n');
  const numbered = lines
    .map((line, index) => ({
      index,
      match: /^\s*(\d{1,6})(?:[ \t]*[|:.)][ \t]?|[ \t]{2,})(.*)$/u.exec(line),
    }))
    .filter(({ match }) => match !== null);
  const nonEmptyCount = lines.filter((line) => line.trim().length > 0).length;
  if (numbered.length < 2 || numbered.length !== nonEmptyCount) return undefined;

  const sequence = numbered.map(({ match }) => Number(match?.[1]));
  if (
    !sequence.every((number, index) => {
      const previous = sequence[index - 1];
      return index === 0 || (previous !== undefined && number === previous + 1);
    })
  ) {
    return undefined;
  }

  const byIndex = new Map(numbered.map(({ index, match }) => [index, match?.[2] ?? '']));
  const stripped = lines.map((line, index) => byIndex.get(index) ?? line).join('\n');
  return looksLikeMermaidSource(stripped) || findFenceCandidates(stripped).length > 0
    ? stripped
    : undefined;
}

function stripCommonIndentation(value: string): {
  readonly source: string;
  readonly width: number;
} {
  const lines = value.split('\n');
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => /^[ \t]*/u.exec(line)?.[0].length ?? 0);
  const width = indents.length === 0 ? 0 : Math.min(...indents);
  if (width === 0) return { source: value, width: 0 };
  const stripped = lines
    .map((line) => (line.trim().length === 0 ? '' : line.slice(width)))
    .join('\n');
  if (!looksLikeMermaidSource(stripped) && findFenceCandidates(stripped).length === 0) {
    return { source: value, width: 0 };
  }
  return { source: stripped, width };
}

function stripProsePrefix(value: string): { readonly source: string; readonly lines: number } {
  if (looksLikeMermaidSource(value) || findFenceCandidates(value).length > 0) {
    return { source: value, lines: 0 };
  }

  const lines = value.split('\n');
  let directiveIndex = -1;
  for (let index = 1; index <= Math.min(4, lines.length - 1); index += 1) {
    if (looksLikeMermaidSource(lines.slice(index).join('\n'))) {
      directiveIndex = index;
      break;
    }
  }
  if (directiveIndex <= 0 || directiveIndex > 4) return { source: value, lines: 0 };

  const prefix = lines.slice(0, directiveIndex).filter((line) => line.trim().length > 0);
  const wrapperPattern =
    /^(?:(?:sure|certainly)[,!:.-]*\s*)?(?:(?:(?:here(?:'s| is)|below is|the following is)\s+)?(?:(?:the|a|your|requested|generated|updated|corrected|cleaned)\s+)*(?:mermaid\s+)?(?:diagram|code)|mermaid)[:.!-]*$/iu;
  if (prefix.length === 0 || !prefix.every((line) => wrapperPattern.test(line.trim()))) {
    return { source: value, lines: 0 };
  }
  return { source: lines.slice(directiveIndex).join('\n'), lines: directiveIndex };
}

function removeSafeZeroWidthFormatting(value: string): {
  readonly source: string;
  readonly removed: number;
  readonly retained: number;
} {
  let removed = 0;
  let retained = 0;
  const source = value.replace(ZERO_WIDTH_FORMATTING_PATTERN, (character, offset: number) => {
    const previous = value.charAt(offset - 1);
    const next = value.charAt(offset + character.length);
    if (
      previous.length === 0 ||
      next.length === 0 ||
      (previous.codePointAt(0) ?? 0x80) <= 0x7f ||
      (next.codePointAt(0) ?? 0x80) <= 0x7f
    ) {
      removed += 1;
      return '';
    }
    retained += 1;
    return character;
  });
  return { source, removed, retained };
}

function repairStructuralEntities(value: string): {
  readonly source: string;
  readonly count: number;
} {
  let count = 0;
  let source = value;
  const replacements: readonly [RegExp, string][] = [
    [/(?<=[=.|ox*+<-])&(?:amp;)?gt;/giu, '>'],
    [/&(?:amp;)?lt;(?=[=.|ox*+>-])/giu, '<'],
  ];
  for (const [pattern, replacement] of replacements) {
    const result = replaceCounted(source, pattern, replacement);
    source = result.value;
    count += result.count;
  }
  return { source, count };
}

function repairStructuralSmartDashes(value: string): {
  readonly source: string;
  readonly count: number;
} {
  let count = 0;
  const lines = value.split('\n').map((line) => {
    let next = line;
    const beforeStructural = replaceCounted(next, /[\u2010-\u2015\u2212]+(?=[>|])/gu, (run) =>
      '-'.repeat(run.length),
    );
    next = beforeStructural.value;
    count += beforeStructural.count;
    const afterStructural = replaceCounted(next, /(?<=[<|])[\u2010-\u2015\u2212]+/gu, (run) =>
      '-'.repeat(run.length),
    );
    count += afterStructural.count;
    return afterStructural.value;
  });
  return { source: lines.join('\n'), count };
}

function trimOuterBlankLines(value: string): { readonly source: string; readonly count: number } {
  if (value.length === 0) return { source: value, count: 0 };
  const lines = value.split('\n');
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? '').trim().length === 0) start += 1;
  while (end > start && (lines[end - 1] ?? '').trim().length === 0) end -= 1;
  return { source: lines.slice(start, end).join('\n'), count: start + (lines.length - end) };
}

function reportWrapper(report: MutableReport): MermaidSourceWrapper {
  if (report.wrappers.size === 0) return 'none';
  if (report.wrappers.size > 1) return 'combined';
  return [...report.wrappers][0] ?? 'none';
}

/**
 * Cleans transport and presentation artifacts commonly added by chat tools,
 * Markdown renderers, rich-text clipboards, and copied line-number views.
 *
 * It is not a security sanitizer and it does not attempt speculative Mermaid
 * grammar rewrites. The strict renderer, iframe sandbox, and SVG sanitizer stay
 * authoritative security boundaries.
 */
export function normalizeMermaidSource(input: string): NormalizedMermaidSource {
  if (input.length > MAX_MERMAID_NORMALIZATION_INPUT_LENGTH) {
    throw new MermaidSourceNormalizationError(
      `Source cleanup is limited to ${MAX_MERMAID_NORMALIZATION_INPUT_LENGTH.toLocaleString('en-US')} input characters.`,
    );
  }

  const mutable: MutableReport = {
    originalLength: input.length,
    changes: new Map(),
    warnings: new Map(),
    wrappers: new Set(),
  };
  let source = input;

  // ANSI CSI/OSC sequences necessarily name ASCII control delimiters.
  const ansi = replaceCounted(
    source,
    // eslint-disable-next-line no-control-regex
    /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\))/gu,
    '',
  );
  source = ansi.value;
  increment(mutable.changes, 'ansi-escape', ansi.count);

  const crlf = replaceCounted(source, /\r\n?|\u0085/gu, '\n');
  source = crlf.value;
  increment(mutable.changes, 'line-ending', crlf.count);

  const unicodeLines = replaceCounted(source, /[\u2028\u2029]/gu, '\n');
  source = unicodeLines.value;
  increment(mutable.changes, 'unicode-line-separator', unicodeLines.count);

  const bom = replaceCounted(source, /\uFEFF/gu, '');
  source = bom.value;
  increment(mutable.changes, 'byte-order-mark', bom.count);

  // Mermaid source keeps tab/newline but has no use for the remaining C0 controls.
  // eslint-disable-next-line no-control-regex
  const controls = replaceCounted(source, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '');
  source = controls.value;
  increment(mutable.changes, 'control-character', controls.count);

  const spaces = replaceCounted(source, /[\u00A0\u202F]/gu, ' ');
  source = spaces.value;
  increment(mutable.changes, 'non-breaking-space', spaces.count);

  const zeroWidth = removeSafeZeroWidthFormatting(source);
  source = zeroWidth.source;
  increment(mutable.changes, 'zero-width-formatting', zeroWidth.removed);
  increment(mutable.warnings, 'suspicious-formatting-control', zeroWidth.retained);

  const trimmedForJson = source.trim();
  if (trimmedForJson.startsWith('"') && trimmedForJson.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmedForJson);
      if (
        typeof parsed === 'string' &&
        (looksLikeMermaidSource(parsed) ||
          findFenceCandidates(parsed).length > 0 ||
          /^\s*<(?:pre\b[^>]*>\s*)?<code\b/iu.test(parsed))
      ) {
        source = parsed;
        mutable.wrappers.add('json-string');
        increment(mutable.changes, 'json-string-wrapper');
      }
    } catch {
      // A leading quote is valid Mermaid label content. Invalid JSON is left as-is.
    }
  } else if (trimmedForJson.startsWith('{') && trimmedForJson.endsWith('}')) {
    try {
      const parsed: unknown = JSON.parse(trimmedForJson);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const candidate = ['source', 'mermaid', 'diagram', 'code']
          .map((key) => record[key])
          .find(
            (value): value is string =>
              typeof value === 'string' &&
              (looksLikeMermaidSource(value) || findFenceCandidates(value).length > 0),
          );
        if (candidate !== undefined) {
          source = candidate;
          mutable.wrappers.add('json-object');
          increment(mutable.changes, 'json-object-wrapper');
        }
      }
    } catch {
      // Mermaid labels can contain braces. Invalid JSON is left as-is.
    }
  }

  // A decoded JSON string can introduce platform line endings and spaces again.
  const decodedLines = replaceCounted(source, /\r\n?|\u0085|[\u2028\u2029]/gu, '\n');
  source = decodedLines.value;
  increment(mutable.changes, 'line-ending', decodedLines.count);

  if (!source.includes('\n') && (source.includes('\\n') || source.includes('\\r'))) {
    const decodedEscapes = source.replace(/\\r\\n|\\n|\\r/gu, '\n').replace(/\\t/gu, '  ');
    if (looksLikeMermaidSource(decodedEscapes)) {
      source = decodedEscapes;
      increment(mutable.changes, 'escaped-line-break');
    }
  }

  const blockquote = stripConsistentBlockquote(source);
  if (blockquote !== undefined) {
    source = blockquote.source;
    increment(mutable.changes, 'markdown-blockquote-prefix', blockquote.levels);
  }

  const numbered = stripConsistentLineNumbers(source);
  if (numbered !== undefined && numbered !== source) {
    source = numbered;
    increment(mutable.changes, 'line-number-prefix');
  }

  const diff = stripConsistentPrefix(source, /^\s*\+[ \t]?(.*)$/u);
  if (diff !== undefined && diff !== source) {
    source = diff;
    increment(mutable.changes, 'diff-prefix');
  }

  const markdownList = stripConsistentPrefix(source, /^\s*[-*][ \t](.*)$/u);
  if (markdownList !== undefined && markdownList !== source) {
    source = markdownList;
    increment(mutable.changes, 'markdown-list-prefix');
  }

  const terminalGutter = stripConsistentPrefix(source, /^\s*│[ \t]?(.*)$/u);
  if (terminalGutter !== undefined && terminalGutter !== source) {
    source = terminalGutter;
    increment(mutable.changes, 'terminal-gutter-prefix');
  }

  const html = unwrapHtmlCode(source);
  if (html.matched) {
    source = html.source;
    mutable.wrappers.add('html-code');
    increment(mutable.changes, 'html-code-wrapper');
  } else if (/^\s*(?:<pre\b[^>]*>\s*)?<code\b/iu.test(source)) {
    increment(mutable.warnings, 'unrecognized-html-wrapper');
  }

  const indentation = stripCommonIndentation(source);
  if (indentation.width > 0) {
    source = indentation.source;
    increment(mutable.changes, 'common-indentation', indentation.width);
  }

  const fences = findFenceCandidates(source);
  const firstFence = fences[0];
  if (firstFence !== undefined) {
    source = firstFence.body;
    mutable.wrappers.add('markdown-fence');
    increment(mutable.changes, 'markdown-fence-wrapper');
    if (!firstFence.complete) increment(mutable.warnings, 'incomplete-mermaid-fence');
    if (fences.length > 1)
      increment(mutable.warnings, 'multiple-mermaid-blocks', fences.length - 1);
  }

  const bodyIndentation = stripCommonIndentation(source);
  if (bodyIndentation.width > 0) {
    source = bodyIndentation.source;
    increment(mutable.changes, 'common-indentation', bodyIndentation.width);
  }

  const bodyLines = source.split('\n');
  if (
    /^(?:mermaid|mmd)\s*:?[ \t]*$/iu.test(bodyLines[0] ?? '') &&
    looksLikeMermaidSource(bodyLines.slice(1).join('\n'))
  ) {
    source = bodyLines.slice(1).join('\n');
    increment(mutable.changes, 'bare-language-marker');
  }

  const prose = stripProsePrefix(source);
  if (prose.lines > 0) {
    source = prose.source;
    increment(mutable.changes, 'prose-prefix', prose.lines);
  }

  const entities = repairStructuralEntities(source);
  source = entities.source;
  increment(mutable.changes, 'structural-html-entity', entities.count);

  const dashes = repairStructuralSmartDashes(source);
  source = dashes.source;
  increment(mutable.changes, 'structural-smart-dash', dashes.count);

  const outer = trimOuterBlankLines(source);
  source = outer.source;
  increment(mutable.changes, 'outer-blank-lines', outer.count);

  const arrowsLeft = source.match(UNICODE_ARROW_PATTERN)?.length ?? 0;
  increment(mutable.warnings, 'unicode-arrow-left-unchanged', arrowsLeft);
  const controlsLeft = source.match(ZERO_WIDTH_FORMATTING_PATTERN)?.length ?? 0;
  if (controlsLeft > zeroWidth.retained) {
    increment(mutable.warnings, 'suspicious-formatting-control', controlsLeft - zeroWidth.retained);
  }

  const changes = [...mutable.changes.entries()].map(([code, count]) => ({ code, count }));
  const warnings = [...mutable.warnings.entries()].map(([code, count]) => ({ code, count }));

  return {
    source,
    report: {
      changed: source !== input,
      wrapper: reportWrapper(mutable),
      wrappers: [...mutable.wrappers],
      originalLength: mutable.originalLength,
      normalizedLength: source.length,
      changes,
      warnings,
    },
  };
}
