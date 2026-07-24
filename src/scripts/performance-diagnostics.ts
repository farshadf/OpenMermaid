import { downloadBlob } from '@lib/import-export';
import {
  LOCAL_VITAL_RECORDED_EVENT,
  LOCAL_VITAL_STORAGE_ERROR_EVENT,
  LocalVitalsRepository,
  aggregateLocalVitals,
  clearLocalVitalsHistory,
  isLocalVitalSampleV1,
  isLocalVitalsHistoryEnabled,
  setLocalVitalsHistoryEnabled,
  type LocalVitalSampleV1,
  type PerformancePageKind,
  type VitalDeviceClass,
  type VitalName,
} from '@lib/performance';

const currentSamples = new Map<VitalName, LocalVitalSampleV1>();
let historySamples: LocalVitalSampleV1[] = [];
let repository: LocalVitalsRepository | undefined;

function requiredElement<T extends Element>(selector: string, elementType: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof elementType)) {
    throw new Error(`Missing performance diagnostics element: ${selector}`);
  }
  return element;
}

const toggle = requiredElement('#vitals-history-toggle', HTMLInputElement);
const status = requiredElement('#vitals-live-status', HTMLElement);
const historySummary = requiredElement('#vitals-history-summary', HTMLElement);
const pageFilter = requiredElement('#vitals-page-filter', HTMLSelectElement);
const deviceFilter = requiredElement('#vitals-device-filter', HTMLSelectElement);
const downloadButton = requiredElement('#vitals-download', HTMLButtonElement);
const clearButton = requiredElement('#vitals-clear', HTMLButtonElement);

function formatValue(name: VitalName, value: number): string {
  if (name === 'CLS') return value.toFixed(3);
  if (value >= 1_000 && name !== 'INP') return `${(value / 1_000).toFixed(2)} s`;
  return `${Math.round(value).toLocaleString()} ms`;
}

function renderCurrent(): void {
  for (const card of document.querySelectorAll<HTMLElement>('[data-current-vital]')) {
    const name = card.dataset.currentVital as VitalName;
    const sample = currentSamples.get(name);
    const value = card.querySelector<HTMLElement>('[data-vital-value]');
    if (value === null) continue;
    if (sample === undefined) {
      value.textContent = name === 'INP' ? 'Awaiting interaction' : 'Waiting';
      card.dataset.rating = 'waiting';
      continue;
    }
    value.textContent = formatValue(name, sample.value);
    card.dataset.rating = sample.rating;
  }
  status.textContent =
    currentSamples.size === 0
      ? 'Measurements appear as the page loads, receives an interaction, or becomes hidden.'
      : `${String(currentSamples.size)} of 5 current-visit metrics observed. INP requires an interaction.`;
}

function filteredHistory(): LocalVitalSampleV1[] {
  return historySamples.filter((sample) => {
    const pageMatches =
      pageFilter.value === 'all' || sample.pageKind === (pageFilter.value as PerformancePageKind);
    const deviceMatches =
      deviceFilter.value === 'all' ||
      sample.deviceClass === (deviceFilter.value as VitalDeviceClass);
    return pageMatches && deviceMatches;
  });
}

function renderHistory(): void {
  const filtered = filteredHistory();
  const aggregates = aggregateLocalVitals(filtered);
  for (const aggregate of aggregates) {
    const row = requiredElement(`[data-history-vital='${aggregate.name}']`, HTMLTableRowElement);
    requiredElement(
      `[data-history-vital='${aggregate.name}'] [data-history-p75]`,
      HTMLElement,
    ).textContent = aggregate.p75 === undefined ? '—' : formatValue(aggregate.name, aggregate.p75);
    requiredElement(
      `[data-history-vital='${aggregate.name}'] [data-history-good]`,
      HTMLElement,
    ).textContent =
      aggregate.percentGood === undefined ? '—' : `${String(Math.round(aggregate.percentGood))}%`;
    requiredElement(
      `[data-history-vital='${aggregate.name}'] [data-history-count]`,
      HTMLElement,
    ).textContent = String(aggregate.count);
    const rating = requiredElement(
      `[data-history-vital='${aggregate.name}'] [data-history-rating]`,
      HTMLElement,
    );
    rating.textContent =
      aggregate.rating === undefined
        ? 'Not measured'
        : `${aggregate.rating.replace('-', ' ')}${aggregate.directional ? ' · directional' : ''}`;
    rating.dataset.historyRating = aggregate.rating ?? 'waiting';
    row.hidden = false;
  }
  const enabled = isLocalVitalsHistoryEnabled();
  historySummary.textContent = enabled
    ? `${String(filtered.length)} retained samples match these filters. Results below 20 samples are directional.`
    : 'History is off. Current-visit readings are ephemeral and disappear when this page closes.';
  downloadButton.disabled = historySamples.length === 0;
  clearButton.disabled = historySamples.length === 0;
}

async function loadHistory(): Promise<void> {
  toggle.checked = isLocalVitalsHistoryEnabled();
  if (!toggle.checked) {
    historySamples = [];
    renderHistory();
    return;
  }
  repository ??= new LocalVitalsRepository();
  historySamples = await repository.list();
  renderHistory();
}

function aggregateReport(): Record<string, unknown> {
  const pageKinds = [...new Set(historySamples.map((sample) => sample.pageKind))].sort();
  const devices = [...new Set(historySamples.map((sample) => sample.deviceClass))].sort();
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scope: 'this-browser-only',
    retentionDays: 30,
    sampleCount: historySamples.length,
    overall: aggregateLocalVitals(historySamples),
    byPageKind: Object.fromEntries(
      pageKinds.map((pageKind) => [
        pageKind,
        aggregateLocalVitals(historySamples.filter((sample) => sample.pageKind === pageKind)),
      ]),
    ),
    byDeviceClass: Object.fromEntries(
      devices.map((deviceClass) => [
        deviceClass,
        aggregateLocalVitals(historySamples.filter((sample) => sample.deviceClass === deviceClass)),
      ]),
    ),
  };
}

window.addEventListener(LOCAL_VITAL_RECORDED_EVENT, (event) => {
  const sample = (event as CustomEvent<unknown>).detail;
  if (!isLocalVitalSampleV1(sample)) return;
  currentSamples.set(sample.name, sample);
  const existing = historySamples.findIndex(({ id }) => id === sample.id);
  if (isLocalVitalsHistoryEnabled()) {
    if (existing >= 0) historySamples[existing] = sample;
    else historySamples.unshift(sample);
  }
  renderCurrent();
  renderHistory();
});

window.addEventListener(LOCAL_VITAL_STORAGE_ERROR_EVENT, () => {
  status.textContent =
    'This browser could not save a performance sample. Current-visit measurement still works.';
});

toggle.addEventListener('change', () => {
  const enabled = setLocalVitalsHistoryEnabled(toggle.checked);
  if (!enabled) {
    toggle.checked = false;
    status.textContent = 'The browser blocked the local performance preference.';
    return;
  }
  void (async () => {
    if (toggle.checked) {
      const writableRepository = (repository ??= new LocalVitalsRepository());
      await Promise.all(
        [...currentSamples.values()].map((sample) => writableRepository.upsert(sample)),
      );
    }
    await loadHistory();
  })().catch(() => {
    status.textContent = 'The browser could not update local performance history.';
  });
});

pageFilter.addEventListener('change', renderHistory);
deviceFilter.addEventListener('change', renderHistory);

downloadButton.addEventListener('click', () => {
  const report = JSON.stringify(aggregateReport(), null, 2);
  if (new TextEncoder().encode(report).byteLength > 32_768) {
    status.textContent = 'The aggregate report exceeded its export limit.';
    return;
  }
  downloadBlob(
    new Blob([report], { type: 'application/json;charset=utf-8' }),
    'open-mermaid-vitals.json',
  );
  status.textContent = 'Downloaded an aggregate-only local performance report.';
});

clearButton.addEventListener('click', () => {
  void (async () => {
    await repository?.close();
    repository = undefined;
    await clearLocalVitalsHistory();
    historySamples = [];
    toggle.checked = false;
    renderHistory();
    status.textContent = 'Local performance history was cleared.';
  })().catch(() => {
    status.textContent = 'Local performance history could not be cleared.';
  });
});

window.addEventListener('pagehide', () => {
  void repository?.close();
});

renderCurrent();
void loadHistory().catch(() => {
  status.textContent = 'Local performance history is unavailable in this browser context.';
});
