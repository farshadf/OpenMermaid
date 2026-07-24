import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { snippetCompletion } from '@codemirror/autocomplete';

import { mermaidDiagramCatalog } from './catalog';

const keywordCompletions: readonly Completion[] = [
  { label: 'accTitle', type: 'keyword', detail: 'Accessible title', apply: 'accTitle: ' },
  { label: 'accDescr', type: 'keyword', detail: 'Accessible description', apply: 'accDescr: ' },
  { label: 'subgraph', type: 'keyword' },
  { label: 'end', type: 'keyword' },
  { label: 'participant', type: 'keyword' },
  { label: 'actor', type: 'keyword' },
  { label: 'classDef', type: 'keyword' },
  { label: 'style', type: 'keyword' },
  { label: 'direction', type: 'keyword' },
  { label: 'title', type: 'keyword' },
];

const diagramCompletions: readonly Completion[] = mermaidDiagramCatalog.map((diagram) =>
  snippetCompletion(diagram.source, {
    label: diagram.id.endsWith('-recipe') ? diagram.id : diagram.directive,
    displayLabel: diagram.label,
    detail: `${diagram.stability} diagram starter`,
    type: 'keyword',
  }),
);

export const mermaidCompletionCatalog = [...diagramCompletions, ...keywordCompletions];

export function mermaidCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w-]*/);
  if (word === null || (word.from === word.to && !context.explicit)) {
    return null;
  }

  return {
    from: word.from,
    options: mermaidCompletionCatalog,
    validFor: /^[\w-]*$/,
  };
}
