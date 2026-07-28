/**
 * Lightweight detector list used by paste normalization and basic syntax
 * highlighting. Keep this separate from the full template sources so those
 * startup paths do not download the maintained catalog.
 */
export const mermaidLegacyDirectiveAliases: readonly string[] = Object.freeze([
  'sankey-beta',
  'xychart-beta',
  'block-beta',
  'packet-beta',
]);

export const mermaidDirectiveKeywords: readonly string[] = Object.freeze([
  'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'quadrantChart',
  'requirementDiagram',
  'gitGraph',
  'info',
  'eventmodeling',
  'swimlane-beta',
  'treeView-beta',
  'ishikawa-beta',
  'venn-beta',
  'wardley-beta',
  'cynefin-beta',
  'railroad-beta',
  'railroad-ebnf-beta',
  'railroad-abnf-beta',
  'railroad-peg-beta',
  'sankey',
  'xychart',
  'block',
  'packet',
  ...mermaidLegacyDirectiveAliases,
  'kanban',
  'architecture-beta',
  'mindmap',
  'timeline',
  'C4Context',
  'radar-beta',
  'treemap-beta',
]);
