import { TEMPLATE_USAGE_CATALOG_VERSION } from './contracts';

/**
 * This intentionally small allowlist prevents arbitrary identifiers from being
 * persisted without pulling template source or the full catalog into telemetry
 * code. A contract test keeps it aligned with the canonical template catalog.
 */
export const TELEMETRY_TEMPLATE_CATALOG_VERSION = TEMPLATE_USAGE_CATALOG_VERSION;
export const TELEMETRY_TEMPLATE_IDS = Object.freeze([
  'flowchart-starter',
  'sequence-starter',
  'class-starter',
  'state-starter',
  'er-starter',
  'journey-starter',
  'gantt-starter',
  'pie-starter',
  'quadrant-starter',
  'requirement-starter',
  'gitgraph-starter',
  'info-starter',
  'event-modeling-starter',
  'swimlane-starter',
  'treeview-starter',
  'ishikawa-starter',
  'venn-starter',
  'wardley-starter',
  'cynefin-starter',
  'railroad-starter',
  'railroad-ebnf-starter',
  'railroad-abnf-starter',
  'railroad-peg-starter',
  'incident-triage-recipe',
  'api-retry-recipe',
  'release-gate-recipe',
  'sankey-starter',
  'xychart-starter',
  'block-starter',
  'packet-starter',
  'kanban-starter',
  'architecture-starter',
  'mindmap-starter',
  'timeline-starter',
  'c4-starter',
  'radar-starter',
  'treemap-starter',
] as const);

const templateIds = new Set<string>(TELEMETRY_TEMPLATE_IDS);

export function isTelemetryTemplateId(value: unknown): value is string {
  return typeof value === 'string' && templateIds.has(value);
}
