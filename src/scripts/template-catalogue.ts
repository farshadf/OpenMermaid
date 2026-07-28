import type { DiagramMaturity, TemplateCategory, TemplateKind } from '../data/templates.ts';
import {
  defaultCatalogueState,
  filterCatalogueItems,
  parseCatalogueState,
  sortCatalogueItems,
  validateTemplateUsageSnapshot,
  writeCatalogueState,
  type CatalogueGroup,
  type CatalogueItem,
  type CatalogueState,
} from '../lib/templates/catalogue.ts';
import { TEMPLATE_USAGE_COUNTS_EVENT } from '../lib/templates/usage-event.ts';

interface CatalogueCard extends CatalogueItem {
  element: HTMLElement;
  usageElement: HTMLElement;
}

interface CatalogueWindow extends Window {
  __openMermaidTemplateUsageCountsV1?: unknown;
}

const categoryLabels: Readonly<Record<TemplateCategory, string>> = {
  'process-workflow': 'Process & workflow',
  'software-systems': 'Software & systems',
  'data-comparison': 'Data & comparison',
  'strategy-analysis': 'Strategy & analysis',
  'syntax-diagnostics': 'Syntax & diagnostics',
};
const maturityLabels: Readonly<Record<DiagramMaturity, string>> = {
  stable: 'Stable',
  beta: 'Beta',
  experimental: 'Experimental',
};
const kindLabels: Readonly<Record<TemplateKind, string>> = {
  starter: 'Starters',
  recipe: 'Task recipes',
};
const groupOrders = {
  category: ['process-workflow', 'software-systems', 'data-comparison', 'strategy-analysis'],
  maturity: ['stable', 'beta', 'experimental'],
  kind: ['starter', 'recipe'],
} as const;
const usageFormatter = new Intl.NumberFormat('en');

function requiredElement<T extends Element>(
  parent: ParentNode,
  selector: string,
  constructor: abstract new (...arguments_: never[]) => T,
): T {
  const element = parent.querySelector(selector);
  if (!(element instanceof constructor)) throw new Error(`Missing catalogue element: ${selector}`);
  return element;
}

function stringData(element: HTMLElement, key: string): string {
  const value = element.dataset[key];
  if (value === undefined) throw new Error(`Missing catalogue card data: ${key}`);
  return value;
}

function initializeCatalogue(root: HTMLElement): void {
  const form = requiredElement(root, '[data-template-controls]', HTMLFormElement);
  const results = requiredElement(root, '[data-template-results]', HTMLElement);
  const resultStatus = requiredElement(root, '#template-results', HTMLElement);
  const noResults = requiredElement(root, '[data-no-results]', HTMLElement);
  const sortSelect = requiredElement(form, '[data-template-sort]', HTMLSelectElement);
  const usageNote = requiredElement(root, '[data-template-usage-note]', HTMLElement);
  const usageDate = requiredElement(usageNote, '[data-template-usage-date]', HTMLElement);
  const cardElements = [...root.querySelectorAll<HTMLElement>('[data-template-card]')];
  const cards: CatalogueCard[] = cardElements.map((element) => ({
    element,
    slug: stringData(element, 'slug'),
    name: stringData(element, 'name'),
    searchText: stringData(element, 'search'),
    category: stringData(element, 'category') as TemplateCategory,
    maturity: stringData(element, 'maturity') as DiagramMaturity,
    kind: stringData(element, 'kind') as TemplateKind,
    recommendedRank: Number(stringData(element, 'rank')),
    usageElement: requiredElement(element, '[data-template-usage]', HTMLElement),
  }));
  const knownSlugs = new Set(cards.map((card) => card.slug));
  let usageAvailable = false;
  let usePopularWhenAvailable = false;

  const stateFromForm = (): CatalogueState => {
    const parameters = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (typeof value === 'string') parameters.append(name, value);
    }
    return parseCatalogueState(parameters);
  };

  const applyStateToForm = (requestedState: CatalogueState): CatalogueState => {
    const state =
      requestedState.sort === 'popular' && !usageAvailable
        ? { ...requestedState, sort: defaultCatalogueState.sort }
        : requestedState;
    const query = requiredElement(form, 'input[name="q"]', HTMLInputElement);
    query.value = state.query;

    for (const checkbox of form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      if (checkbox.name === 'category') {
        checkbox.checked = state.categories.includes(checkbox.value as TemplateCategory);
      } else if (checkbox.name === 'maturity') {
        checkbox.checked = state.maturities.includes(checkbox.value as DiagramMaturity);
      } else if (checkbox.name === 'kind') {
        checkbox.checked = state.kinds.includes(checkbox.value as TemplateKind);
      }
    }

    requiredElement(form, 'select[name="sort"]', HTMLSelectElement).value = state.sort;
    requiredElement(form, 'select[name="group"]', HTMLSelectElement).value = state.group;
    return state;
  };

  const groupValueFor = (item: CatalogueItem, grouping: CatalogueGroup): string => {
    if (grouping === 'category') return item.category;
    if (grouping === 'maturity') return item.maturity;
    if (grouping === 'kind') return item.kind;
    return 'all';
  };

  const groupLabelFor = (value: string, grouping: CatalogueGroup): string => {
    if (grouping === 'category') return categoryLabels[value as TemplateCategory];
    if (grouping === 'maturity') return maturityLabels[value as DiagramMaturity];
    if (grouping === 'kind') return kindLabels[value as TemplateKind];
    return 'All templates';
  };

  const orderedGroupValues = (items: readonly CatalogueItem[], grouping: CatalogueGroup) => {
    if (grouping === 'none') return ['all'];
    const present = new Set(items.map((item) => groupValueFor(item, grouping)));
    const order = groupOrders[grouping];
    if (grouping === 'category') {
      return [...order, 'syntax-diagnostics'].filter((value) => present.has(value));
    }
    return order.filter((value) => present.has(value));
  };

  const render = (state: CatalogueState, updateUrl: boolean): void => {
    const visibleCards = sortCatalogueItems(filterCatalogueItems(cards, state), state.sort);
    const fragment = document.createDocumentFragment();

    for (const groupValue of orderedGroupValues(visibleCards, state.group)) {
      const groupCards = visibleCards.filter(
        (card) => groupValueFor(card, state.group) === groupValue,
      );
      if (groupCards.length === 0) continue;

      const section = document.createElement('section');
      section.className = 'catalogue-group';
      section.dataset.templateGroup = groupValue;
      const headingRow = document.createElement('div');
      headingRow.className = 'catalogue-group__heading';
      const heading = document.createElement('h2');
      heading.textContent = groupLabelFor(groupValue, state.group);
      const groupCount = document.createElement('span');
      groupCount.textContent = String(groupCards.length);
      headingRow.append(heading, groupCount);
      const grid = document.createElement('div');
      grid.className = 'catalogue-grid';
      grid.append(...groupCards.map((card) => card.element));
      section.append(headingRow, grid);
      fragment.append(section);
    }

    results.replaceChildren(fragment);
    results.hidden = visibleCards.length === 0;
    noResults.hidden = visibleCards.length !== 0;
    const hasCriteria =
      state.query.length > 0 ||
      state.categories.length > 0 ||
      state.maturities.length > 0 ||
      state.kinds.length > 0;
    resultStatus.textContent = hasCriteria
      ? `${String(visibleCards.length)} of ${String(cards.length)} templates match.`
      : `Showing all ${String(cards.length)} templates.`;

    const stateIsDefault =
      !hasCriteria &&
      state.sort === defaultCatalogueState.sort &&
      state.group === defaultCatalogueState.group;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-template-clear]')) {
      button.disabled = stateIsDefault;
    }

    if (updateUrl) {
      const nextUrl = writeCatalogueState(new URL(window.location.href), state);
      window.history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    }
  };

  const renderFromForm = (): void => {
    render(stateFromForm(), true);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    renderFromForm();
  });
  sortSelect.addEventListener('change', () => {
    usePopularWhenAvailable = false;
  });
  form.addEventListener('input', renderFromForm);
  form.addEventListener('change', renderFromForm);

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-template-clear]')) {
    button.addEventListener('click', () => {
      usePopularWhenAvailable = false;
      const state = applyStateToForm(defaultCatalogueState);
      render(state, true);
      requiredElement(form, 'input[name="q"]', HTMLInputElement).focus();
    });
  }

  window.addEventListener('popstate', () => {
    const requestedState = parseCatalogueState(new URL(window.location.href).searchParams);
    usePopularWhenAvailable = requestedState.sort === 'popular' && !usageAvailable;
    const state = applyStateToForm(requestedState);
    render(state, requestedState.sort === 'popular' && state.sort !== 'popular');
  });

  const applyUsageSnapshot = (value: unknown): void => {
    const snapshot = validateTemplateUsageSnapshot(value, knownSlugs);
    if (snapshot === undefined) return;

    usageAvailable = true;
    for (const card of cards) {
      const count = snapshot.counts[card.slug];
      if (count === undefined) delete card.usageCount;
      else card.usageCount = count;
      card.usageElement.hidden = count === undefined;
      card.usageElement.textContent =
        count === undefined ? '' : `${usageFormatter.format(count)}+ reported uses`;
    }
    if (!sortSelect.querySelector('option[value="popular"]')) {
      const option = document.createElement('option');
      option.value = 'popular';
      option.textContent = 'Most reported';
      sortSelect.append(option);
    }
    const generatedDate = new Date(snapshot.generatedAt);
    usageDate.textContent = ` Snapshot generated ${generatedDate.toLocaleDateString('en', { dateStyle: 'medium' })}.`;
    usageNote.hidden = false;
    const currentState = stateFromForm();
    const nextState = usePopularWhenAvailable
      ? { ...currentState, sort: 'popular' as const }
      : currentState;
    usePopularWhenAvailable = false;
    applyStateToForm(nextState);
    render(nextState, true);
  };

  const usageEventListener = (event: Event): void => {
    if (event instanceof CustomEvent) applyUsageSnapshot(event.detail);
  };
  window.addEventListener(TEMPLATE_USAGE_COUNTS_EVENT, usageEventListener);
  document.addEventListener(TEMPLATE_USAGE_COUNTS_EVENT, usageEventListener);

  const requestedInitialState = parseCatalogueState(new URL(window.location.href).searchParams);
  usePopularWhenAvailable = requestedInitialState.sort === 'popular';
  const initialState = applyStateToForm(requestedInitialState);
  render(initialState, true);
  applyUsageSnapshot((window as CatalogueWindow).__openMermaidTemplateUsageCountsV1);
}

const root = document.querySelector('[data-template-catalogue]');
if (root instanceof HTMLElement) initializeCatalogue(root);
