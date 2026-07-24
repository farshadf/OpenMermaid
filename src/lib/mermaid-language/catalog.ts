import { diagramTemplates } from '../../data/templates';

export type MermaidDiagramStability = 'stable' | 'beta' | 'experimental';

export interface MermaidDiagramCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly directive: string;
  readonly description: string;
  readonly stability: MermaidDiagramStability;
  readonly source: string;
}

export const MERMAID_CATALOG_VERSION = '11.16.0-v2';

/**
 * The editor and prerendered template pages intentionally share one catalog.
 * Keeping sources in one place prevents a public example from drifting away
 * from the fixture validated by the editor's pinned Mermaid release.
 */
export const mermaidDiagramCatalog: readonly MermaidDiagramCatalogEntry[] = Object.freeze(
  diagramTemplates.map((template) => ({
    id: template.slug.replace(/-starter$/u, ''),
    label: template.diagramType,
    directive: template.source.trimStart().split(/\s/u, 1)[0] ?? template.diagramType,
    description: template.summary,
    stability: template.maturity,
    source: template.source,
  })),
);

const firstTemplate = mermaidDiagramCatalog[0];
if (firstTemplate === undefined) throw new Error('The Mermaid template catalog must not be empty.');

export const defaultMermaidSource = firstTemplate.source;

export const mermaidDirectiveKeywords: readonly string[] = Object.freeze([
  ...new Set(mermaidDiagramCatalog.map(({ directive }) => directive)),
]);
