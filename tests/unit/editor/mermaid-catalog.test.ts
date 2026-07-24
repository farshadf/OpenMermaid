import { CompletionContext } from '@codemirror/autocomplete';
import { StringStream } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import mermaid from 'mermaid';
import { describe, expect, it } from 'vitest';

import {
  MERMAID_CATALOG_VERSION,
  mermaidCompletionSource,
  mermaidDiagramCatalog,
  mermaidDirectiveKeywords,
  mermaidDirectivePattern,
  mermaidStreamParser,
} from '@lib/mermaid-language';

const PINNED_REGISTERED_DETECTORS = [
  '---',
  'architecture',
  'block',
  'c4',
  'class',
  'classDiagram',
  'cynefin',
  'er',
  'error',
  'eventmodeling',
  'flowchart',
  'flowchart-elk',
  'flowchart-v2',
  'gantt',
  'gitGraph',
  'info',
  'ishikawa',
  'journey',
  'kanban',
  'mindmap',
  'packet',
  'pie',
  'quadrantChart',
  'radar',
  'railroad',
  'railroadAbnf',
  'railroadEbnf',
  'railroadPeg',
  'requirement',
  'sankey',
  'sequence',
  'state',
  'stateDiagram',
  'swimlane',
  'timeline',
  'treeView',
  'treemap',
  'venn',
  'wardley',
  'xychart',
] as const;

const CATALOG_DETECTOR_FAMILIES = [
  'architecture',
  'block',
  'c4',
  'class',
  'cynefin',
  'er',
  'eventmodeling',
  'flowchart-v2',
  'gantt',
  'gitGraph',
  'info',
  'ishikawa',
  'journey',
  'kanban',
  'mindmap',
  'packet',
  'pie',
  'quadrantChart',
  'radar',
  'railroad',
  'railroadAbnf',
  'railroadEbnf',
  'railroadPeg',
  'requirement',
  'sankey',
  'sequence',
  'stateDiagram',
  'swimlane',
  'timeline',
  'treeView',
  'treemap',
  'venn',
  'wardley',
  'xychart',
] as const;

function initializePinnedMermaid(): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    maxTextSize: 50_000,
    maxEdges: 500,
  });
}

function createMermaidLanguageState() {
  if (mermaidStreamParser.startState === undefined) {
    throw new Error('The Mermaid stream parser must define an initial state.');
  }
  return mermaidStreamParser.startState(2);
}

describe('maintained Mermaid catalog', () => {
  it('highlights every maintained catalog directive', () => {
    for (const directive of mermaidDirectiveKeywords) {
      expect(directive).toMatch(mermaidDirectivePattern);
      const stream = new StringStream(`${directive} example`, 4, 2);
      expect(mermaidStreamParser.token(stream, createMermaidLanguageState())).toBe('keyword');
    }
  });

  it('tokenizes frontmatter, comments, strings, numbers, and arrows', () => {
    const state = createMermaidLanguageState();
    const token = (line: string) => {
      const stream = new StringStream(line, 4, 2);
      return mermaidStreamParser.token(stream, state);
    };

    expect(token('---')).toBe('meta');
    expect(token('title: Example')).toBe('meta');
    expect(token('---')).toBe('meta');
    expect(token('%% comment')).toBe('comment');
    expect(token('"label"')).toBe('string');
    expect(token('42')).toBe('number');
    expect(token('-->')).toBe('operator');
  });

  it('is versioned, unique, and safely bounded', () => {
    expect(MERMAID_CATALOG_VERSION).toBe('11.16.0-v2');
    expect(mermaidDiagramCatalog.length).toBe(37);
    expect(new Set(mermaidDiagramCatalog.map(({ id }) => id)).size).toBe(
      mermaidDiagramCatalog.length,
    );
    expect(
      new Set(mermaidDiagramCatalog.map(({ directive }) => directive)).size,
    ).toBeGreaterThanOrEqual(22);
    for (const diagram of mermaidDiagramCatalog) {
      expect(diagram.source.length).toBeGreaterThan(0);
      expect(diagram.source.length).toBeLessThanOrEqual(50_000);
      expect(diagram.source.trimStart().toLocaleLowerCase()).toMatch(
        new RegExp(`^${diagram.directive.toLocaleLowerCase().replace('-', '\\-')}`),
      );
    }
  });

  it('locks the exact detector registry exposed by pinned Mermaid', () => {
    initializePinnedMermaid();
    const registered = mermaid
      .getRegisteredDiagramsMetadata()
      .map(({ id }) => id)
      .sort();

    expect(registered).toEqual([...PINNED_REGISTERED_DETECTORS].sort());
  });

  it('maintains a fixture for every user-facing detector family and railroad dialect', () => {
    initializePinnedMermaid();
    const detected = [
      ...new Set(mermaidDiagramCatalog.map(({ source }) => mermaid.detectType(source))),
    ].sort();

    expect(detected).toEqual([...CATALOG_DETECTOR_FAMILIES].sort());
  });

  it('offers directive and accessibility completions', () => {
    const state = EditorState.create({ doc: 'flo' });
    const context = new CompletionContext(state, 3, true);
    const result = mermaidCompletionSource(context);
    expect(result?.from).toBe(0);
    expect(result?.options.some(({ label }) => label === 'flowchart')).toBe(true);
    expect(result?.options.some(({ label }) => label === 'accTitle')).toBe(true);
    expect(result?.options.some(({ label }) => label === 'accDescr')).toBe(true);
  });

  it.each(mermaidDiagramCatalog)(
    'parses the $label fixture with pinned Mermaid',
    async ({ source }) => {
      initializePinnedMermaid();
      await expect(mermaid.parse(source, { suppressErrors: false })).resolves.toBeTruthy();
    },
  );
});
