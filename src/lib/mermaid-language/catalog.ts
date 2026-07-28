import { diagramTemplates } from '../../data/templates';
import { DEFAULT_MERMAID_SOURCE } from '../../data/default-source.ts';

export type MermaidDiagramStability = 'stable' | 'beta' | 'experimental';

export interface MermaidDiagramCatalogEntry {
  readonly id: string;
  readonly slug: string;
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
    slug: template.slug,
    label: template.diagramType,
    directive: template.source.trimStart().split(/\s/u, 1)[0] ?? template.diagramType,
    description: template.summary,
    stability: template.maturity,
    source: template.source,
  })),
);

const firstTemplate = mermaidDiagramCatalog[0];
if (firstTemplate?.source !== DEFAULT_MERMAID_SOURCE) {
  throw new Error('The Mermaid template catalog must begin with the default editor source.');
}

export const defaultMermaidSource = DEFAULT_MERMAID_SOURCE;
