import { defaultHighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import type { StreamParser, StringStream } from '@codemirror/language';

import { mermaidDirectiveKeywords } from './directives';

interface MermaidLanguageState {
  inFrontmatter: boolean;
  frontmatterClosed: boolean;
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export const mermaidDirectivePattern = new RegExp(
  `^(?:${mermaidDirectiveKeywords
    .toSorted((left, right) => right.length - left.length)
    .map(escapePattern)
    .join('|')}|graph|stateDiagram-v2)\\b`,
  'i',
);

export const mermaidStreamParser: StreamParser<MermaidLanguageState> = {
  startState: () => ({ inFrontmatter: false, frontmatterClosed: false }),
  token(stream: StringStream, state: MermaidLanguageState): string | null {
    if (stream.sol() && !state.frontmatterClosed && stream.match(/^---\s*$/)) {
      state.inFrontmatter = !state.inFrontmatter;
      if (!state.inFrontmatter) state.frontmatterClosed = true;
      return 'meta';
    }

    if (state.inFrontmatter) {
      stream.skipToEnd();
      return 'meta';
    }

    if (stream.match(/^%%\{.*?}%%/)) return 'meta';
    if (stream.match(/^%%.*/)) return 'comment';
    if (stream.sol() && stream.match(mermaidDirectivePattern)) return 'keyword';
    if (
      stream.match(
        /^(?:accTitle|accDescr|title|section|participant|actor|activate|deactivate|loop|alt|else|opt|par|and|rect|critical|break|subgraph|direction|classDef|style|linkStyle|click|note|state|class|namespace|dateFormat|axisFormat|excludes|includes|todayMarker|commit|branch|checkout|merge|cherry-pick|columns|group|service|junction|axis|curve|max)\b/i,
      )
    ) {
      return 'keyword';
    }
    if (stream.match(/^(?:TB|TD|BT|RL|LR)\b/)) return 'atom';
    if (
      stream.match(
        /^(?:-->|---|-.->|==>|-->>|->>|--x|--\)|<-->|o--o|x--x|\|--|\}\||\|o|\|\{|\bto\b)/,
      )
    ) {
      return 'operator';
    }
    if (stream.match(/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)) return 'string';
    if (stream.match(/^-?(?:\d+\.?\d*|\.\d+)\b/)) return 'number';
    if (stream.match(/^[A-Za-z_][\w-]*(?=\s*(?:\[|\(|\{|:))/)) return 'variableName';
    if (stream.match(/^[#;,:]/)) return 'punctuation';
    if (stream.eatSpace()) return null;
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: '%%' },
    closeBrackets: { brackets: ['(', '[', '{', '"'] },
  },
};

export const mermaidLanguage = StreamLanguage.define(mermaidStreamParser);

export const mermaidSyntaxHighlighting = syntaxHighlighting(defaultHighlightStyle, {
  fallback: true,
});
