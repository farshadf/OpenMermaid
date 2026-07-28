import type { DiagramMaturity, TemplateCategory, TemplateKind } from '../../data/templates.ts';
import type { TemplateUsageCountsEventDetail } from './usage-event.ts';

export const TEMPLATE_USAGE_MINIMUM = 20;
export const TEMPLATE_USAGE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export const TEMPLATE_QUERY_MAX_LENGTH = 120;
const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

export const catalogueCategories: readonly TemplateCategory[] = [
  'process-workflow',
  'software-systems',
  'data-comparison',
  'strategy-analysis',
  'syntax-diagnostics',
];
export const catalogueMaturities: readonly DiagramMaturity[] = ['stable', 'beta', 'experimental'];
export const catalogueKinds: readonly TemplateKind[] = ['starter', 'recipe'];
export const catalogueSorts = ['recommended', 'popular', 'name'] as const;
export const catalogueGroups = ['category', 'maturity', 'kind', 'none'] as const;

export type CatalogueSort = (typeof catalogueSorts)[number];
export type CatalogueGroup = (typeof catalogueGroups)[number];

export interface CatalogueState {
  query: string;
  categories: readonly TemplateCategory[];
  maturities: readonly DiagramMaturity[];
  kinds: readonly TemplateKind[];
  sort: CatalogueSort;
  group: CatalogueGroup;
}

export interface CatalogueItem {
  slug: string;
  name: string;
  searchText: string;
  category: TemplateCategory;
  maturity: DiagramMaturity;
  kind: TemplateKind;
  recommendedRank: number;
  usageCount?: number;
}

export const defaultCatalogueState: CatalogueState = {
  query: '',
  categories: [],
  maturities: [],
  kinds: [],
  sort: 'recommended',
  group: 'category',
};

function isAllowed<const T extends string>(
  value: string | null,
  allowed: readonly T[],
): value is T {
  return value !== null && allowed.some((candidate) => candidate === value);
}

function allowedValues<const T extends string>(
  values: readonly string[],
  allowed: readonly T[],
): readonly T[] {
  return allowed.filter((candidate) => values.includes(candidate));
}

export function parseCatalogueState(parameters: URLSearchParams): CatalogueState {
  const sortValue = parameters.get('sort');
  const groupValue = parameters.get('group');

  return {
    query: parameters.get('q')?.trim().slice(0, TEMPLATE_QUERY_MAX_LENGTH) ?? '',
    categories: allowedValues(parameters.getAll('category'), catalogueCategories),
    maturities: allowedValues(parameters.getAll('maturity'), catalogueMaturities),
    kinds: allowedValues(parameters.getAll('kind'), catalogueKinds),
    sort: isAllowed(sortValue, catalogueSorts) ? sortValue : defaultCatalogueState.sort,
    group: isAllowed(groupValue, catalogueGroups) ? groupValue : defaultCatalogueState.group,
  };
}

export function writeCatalogueState(url: URL, state: CatalogueState): URL {
  const nextUrl = new URL(url);
  for (const parameter of ['q', 'category', 'maturity', 'kind', 'sort', 'group']) {
    nextUrl.searchParams.delete(parameter);
  }

  const query = state.query.trim();
  if (query.length > 0) nextUrl.searchParams.set('q', query);
  for (const category of catalogueCategories) {
    if (state.categories.includes(category)) nextUrl.searchParams.append('category', category);
  }
  for (const maturity of catalogueMaturities) {
    if (state.maturities.includes(maturity)) nextUrl.searchParams.append('maturity', maturity);
  }
  for (const kind of catalogueKinds) {
    if (state.kinds.includes(kind)) nextUrl.searchParams.append('kind', kind);
  }
  if (state.sort !== defaultCatalogueState.sort) nextUrl.searchParams.set('sort', state.sort);
  if (state.group !== defaultCatalogueState.group) nextUrl.searchParams.set('group', state.group);

  return nextUrl;
}

export function normalizeCatalogueText(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/\p{Mark}+/gu, '')
      .toLocaleLowerCase('en')
      .match(/[\p{Letter}\p{Number}]+/gu)
      ?.join(' ')
      .trim() ?? ''
  );
}

export function matchesCatalogueQuery(searchText: string, query: string): boolean {
  const tokens = normalizeCatalogueText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const normalizedSearchText = normalizeCatalogueText(searchText);
  return tokens.every((token) => normalizedSearchText.includes(token));
}

export function filterCatalogueItems<T extends CatalogueItem>(
  items: readonly T[],
  state: CatalogueState,
): T[] {
  return items.filter(
    (item) =>
      matchesCatalogueQuery(item.searchText, state.query) &&
      (state.categories.length === 0 || state.categories.includes(item.category)) &&
      (state.maturities.length === 0 || state.maturities.includes(item.maturity)) &&
      (state.kinds.length === 0 || state.kinds.includes(item.kind)),
  );
}

export function sortCatalogueItems<T extends CatalogueItem>(
  items: readonly T[],
  sort: CatalogueSort,
): T[] {
  return [...items].sort((left, right) => {
    if (sort === 'name') return left.name.localeCompare(right.name, 'en');
    if (sort === 'popular') {
      const countDifference = (right.usageCount ?? -1) - (left.usageCount ?? -1);
      if (countDifference !== 0) return countDifference;
    }
    return left.recommendedRank - right.recommendedRank;
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateTemplateUsageSnapshot(
  value: unknown,
  knownSlugs: ReadonlySet<string>,
  now = Date.now(),
): TemplateUsageCountsEventDetail | undefined {
  if (!isPlainRecord(value) || typeof value.generatedAt !== 'string') return undefined;

  const generatedAtTime = Date.parse(value.generatedAt);
  if (
    !Number.isFinite(generatedAtTime) ||
    generatedAtTime > now + FUTURE_CLOCK_TOLERANCE_MS ||
    now - generatedAtTime > TEMPLATE_USAGE_MAX_AGE_MS ||
    !isPlainRecord(value.counts)
  ) {
    return undefined;
  }

  const counts: Record<string, number> = {};
  for (const [slug, count] of Object.entries(value.counts)) {
    if (!knownSlugs.has(slug)) continue;
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count < TEMPLATE_USAGE_MINIMUM
    ) {
      return undefined;
    }
    counts[slug] = count;
  }

  if (Object.keys(counts).length === 0) return undefined;
  return { generatedAt: value.generatedAt, counts };
}
