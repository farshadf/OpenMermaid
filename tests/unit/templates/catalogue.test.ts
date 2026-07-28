import { describe, expect, it } from 'vitest';

import {
  diagramTemplates,
  templateCategoryOrder,
  type TemplateCategory,
} from '../../../src/data/templates.ts';
import {
  TEMPLATE_USAGE_MAX_AGE_MS,
  filterCatalogueItems,
  matchesCatalogueQuery,
  normalizeCatalogueText,
  parseCatalogueState,
  sortCatalogueItems,
  validateTemplateUsageSnapshot,
  writeCatalogueState,
  type CatalogueItem,
} from '../../../src/lib/templates/catalogue.ts';

const expectedCategorySlugs: Readonly<Record<TemplateCategory, readonly string[]>> = {
  'process-workflow': [
    'flowchart-starter',
    'state-starter',
    'journey-starter',
    'gantt-starter',
    'gitgraph-starter',
    'event-modeling-starter',
    'swimlane-starter',
    'incident-triage-recipe',
    'release-gate-recipe',
    'kanban-starter',
    'timeline-starter',
  ],
  'software-systems': [
    'sequence-starter',
    'class-starter',
    'er-starter',
    'requirement-starter',
    'treeview-starter',
    'api-retry-recipe',
    'block-starter',
    'packet-starter',
    'architecture-starter',
    'c4-starter',
  ],
  'data-comparison': [
    'pie-starter',
    'quadrant-starter',
    'venn-starter',
    'sankey-starter',
    'xychart-starter',
    'radar-starter',
    'treemap-starter',
  ],
  'strategy-analysis': [
    'ishikawa-starter',
    'wardley-starter',
    'cynefin-starter',
    'mindmap-starter',
  ],
  'syntax-diagnostics': [
    'info-starter',
    'railroad-starter',
    'railroad-ebnf-starter',
    'railroad-abnf-starter',
    'railroad-peg-starter',
  ],
};

const items: readonly CatalogueItem[] = [
  {
    slug: 'api-retry-recipe',
    name: 'API retry sequence recipe',
    searchText: 'API retry sequence service backoff',
    category: 'software-systems',
    maturity: 'stable',
    kind: 'recipe',
    recommendedRank: 2,
    usageCount: 40,
  },
  {
    slug: 'flowchart-starter',
    name: 'Flowchart starter',
    searchText: 'Flowchart process decision workflow',
    category: 'process-workflow',
    maturity: 'stable',
    kind: 'starter',
    recommendedRank: 1,
    usageCount: 80,
  },
  {
    slug: 'mindmap-starter',
    name: 'Mindmap starter',
    searchText: 'Mindmap ideas hierarchy',
    category: 'strategy-analysis',
    maturity: 'experimental',
    kind: 'starter',
    recommendedRank: 3,
  },
];

describe('template catalogue data', () => {
  it('keeps a complete, explicitly faceted catalogue with stable ranks', () => {
    expect(diagramTemplates).toHaveLength(37);
    expect(
      diagramTemplates.map(({ recommendedRank }) => recommendedRank).sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 37 }, (_, index) => index + 1));
    expect(new Set(diagramTemplates.map(({ slug }) => slug)).size).toBe(37);
    expect(
      diagramTemplates.filter(({ kind }) => kind === 'recipe').map(({ slug }) => slug),
    ).toEqual(['incident-triage-recipe', 'api-retry-recipe', 'release-gate-recipe']);

    for (const category of templateCategoryOrder) {
      expect(
        diagramTemplates
          .filter((template) => template.category === category)
          .map(({ slug }) => slug),
      ).toEqual(expectedCategorySlugs[category]);
    }
  });
});

describe('template catalogue state and matching', () => {
  it('parses repeated valid facets and ignores unsupported values', () => {
    const state = parseCatalogueState(
      new URLSearchParams(
        'q=api+retry&category=software-systems&category=unknown&maturity=stable&kind=recipe&sort=name&group=kind',
      ),
    );

    expect(state).toEqual({
      query: 'api retry',
      categories: ['software-systems'],
      maturities: ['stable'],
      kinds: ['recipe'],
      sort: 'name',
      group: 'kind',
    });
  });

  it('bounds user-controlled query state before matching or writing it back', () => {
    const state = parseCatalogueState(new URLSearchParams({ q: `api ${'x'.repeat(200)}` }));
    expect(state.query).toHaveLength(120);
    expect(
      writeCatalogueState(
        new URL('https://openmermaid.example/templates/'),
        state,
      ).searchParams.get('q'),
    ).toHaveLength(120);
  });

  it('writes canonical catalogue parameters while preserving unrelated URL state', () => {
    const initial = new URL(
      'https://openmermaid.example/templates/?campaign=docs&q=old&category=bad',
    );
    const state = parseCatalogueState(
      new URLSearchParams(
        'q=api+retry&category=software-systems&maturity=stable&kind=recipe&sort=name&group=none',
      ),
    );

    expect(writeCatalogueState(initial, state).toString()).toBe(
      'https://openmermaid.example/templates/?campaign=docs&q=api+retry&category=software-systems&maturity=stable&kind=recipe&sort=name&group=none',
    );
  });

  it('normalizes Unicode and requires every query token to match', () => {
    expect(normalizeCatalogueText('  Séquence—API  ')).toBe('sequence api');
    expect(matchesCatalogueQuery('API retry sequence with backoff', 'retry API')).toBe(true);
    expect(matchesCatalogueQuery('API retry sequence with backoff', 'retry database')).toBe(false);
  });

  it('combines facets with AND and selected values within a facet with OR', () => {
    const state = parseCatalogueState(
      new URLSearchParams(
        'q=api+retry&category=software-systems&category=process-workflow&maturity=stable&kind=recipe',
      ),
    );
    expect(filterCatalogueItems(items, state).map(({ slug }) => slug)).toEqual([
      'api-retry-recipe',
    ]);
  });

  it('sorts deterministically by recommendation, name, or reported lower-bound usage', () => {
    expect(sortCatalogueItems(items, 'recommended').map(({ slug }) => slug)).toEqual([
      'flowchart-starter',
      'api-retry-recipe',
      'mindmap-starter',
    ]);
    expect(sortCatalogueItems(items, 'name').map(({ slug }) => slug)).toEqual([
      'api-retry-recipe',
      'flowchart-starter',
      'mindmap-starter',
    ]);
    expect(sortCatalogueItems(items, 'popular').map(({ slug }) => slug)).toEqual([
      'flowchart-starter',
      'api-retry-recipe',
      'mindmap-starter',
    ]);
  });
});

describe('template aggregate usage seam', () => {
  const now = Date.parse('2026-07-27T12:00:00.000Z');
  const slugs = new Set(['flowchart-starter', 'sequence-starter']);

  it('accepts fresh privacy-thresholded lower-bound counts and ignores unknown future slugs', () => {
    expect(
      validateTemplateUsageSnapshot(
        {
          generatedAt: '2026-07-27T11:00:00.000Z',
          counts: {
            'flowchart-starter': 120,
            'sequence-starter': 20,
            'future-starter': 500,
          },
        },
        slugs,
        now,
      ),
    ).toEqual({
      generatedAt: '2026-07-27T11:00:00.000Z',
      counts: { 'flowchart-starter': 120, 'sequence-starter': 20 },
    });
  });

  it.each([
    {
      label: 'stale',
      value: {
        generatedAt: new Date(now - TEMPLATE_USAGE_MAX_AGE_MS - 1).toISOString(),
        counts: { 'flowchart-starter': 20 },
      },
    },
    {
      label: 'far-future',
      value: {
        generatedAt: '2026-07-28T12:00:00.000Z',
        counts: { 'flowchart-starter': 20 },
      },
    },
    {
      label: 'below-threshold',
      value: {
        generatedAt: '2026-07-27T11:00:00.000Z',
        counts: { 'flowchart-starter': 19 },
      },
    },
    {
      label: 'fractional',
      value: {
        generatedAt: '2026-07-27T11:00:00.000Z',
        counts: { 'flowchart-starter': 20.5 },
      },
    },
  ])('rejects a $label aggregate snapshot', ({ value }) => {
    expect(validateTemplateUsageSnapshot(value, slugs, now)).toBeUndefined();
  });
});
