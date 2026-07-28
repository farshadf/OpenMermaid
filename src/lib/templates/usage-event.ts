/**
 * Neutral browser event seam between the optional aggregate counts provider
 * and the always-available static template catalogue.
 */
export const TEMPLATE_USAGE_COUNTS_EVENT = 'openmermaid:template-usage-counts';

export interface TemplateUsageCountsEventDetail {
  readonly generatedAt: string;
  readonly counts: Readonly<Record<string, number>>;
}
