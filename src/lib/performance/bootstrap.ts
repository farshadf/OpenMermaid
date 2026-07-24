import { classifyPerformancePage } from './page-kind';
import { isLocalVitalsHistoryEnabled } from './preference';
import { isPerformancePageKind } from './validation';

function scheduleMeasurement(start: () => void): void {
  const schedulingWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number;
  };
  if (typeof schedulingWindow.requestIdleCallback === 'function') {
    schedulingWindow.requestIdleCallback(start, { timeout: 1_500 });
    return;
  }
  globalThis.setTimeout(start, 0);
}

export function bootstrapLocalVitals(): void {
  const force = document.documentElement.dataset.vitalsCurrentVisit === 'true';
  if (!force && !isLocalVitalsHistoryEnabled()) return;
  const declaredPageKind = document.documentElement.dataset.performancePageKind;
  const pageKind = isPerformancePageKind(declaredPageKind)
    ? declaredPageKind
    : classifyPerformancePage(location.pathname);
  scheduleMeasurement(() => {
    void import('./measure')
      .then(({ startLocalVitalsMeasurement }) => startLocalVitalsMeasurement(pageKind))
      .catch(() => {
        // Performance diagnostics are best-effort and must never affect the application shell.
      });
  });
}
