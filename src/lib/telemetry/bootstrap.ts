import { isAggregateTelemetryEnabled } from './mode';
import {
  isGlobalPrivacyControlEnabled,
  isTemplateUsageSharingEnabled,
  setTemplateUsageSharingEnabled,
} from './preference';

async function clearTelemetryQueue(): Promise<boolean> {
  try {
    const { clearTemplateUsageTelemetry } = await import('./queue');
    return await clearTemplateUsageTelemetry();
  } catch {
    return false;
  }
}

function scheduleIdle(callback: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback, { timeout: 1_500 });
  } else {
    globalThis.setTimeout(callback, 0);
  }
}

function bindPreferenceControl(): void {
  const checkbox = document.querySelector<HTMLInputElement>('[data-template-telemetry-toggle]');
  const status = document.querySelector<HTMLElement>('[data-template-telemetry-status]');
  if (checkbox === null || status === null) return;

  const globalPrivacyControl = isGlobalPrivacyControlEnabled();
  checkbox.checked = isTemplateUsageSharingEnabled();
  checkbox.disabled = globalPrivacyControl;
  status.textContent = globalPrivacyControl
    ? 'Disabled because your browser is sending a Global Privacy Control preference.'
    : checkbox.checked
      ? 'Sharing is on for future template applications.'
      : 'Sharing is off.';

  checkbox.addEventListener('change', () => {
    const enabled = setTemplateUsageSharingEnabled(checkbox.checked);
    checkbox.checked = enabled;
    if (!enabled) void clearTelemetryQueue();
    status.textContent = enabled
      ? 'Sharing is on for future template applications.'
      : 'Sharing is off. Unsent template events were cleared.';
  });
}

export function enforceGlobalPrivacyControl(
  globalPrivacyControlEnabled = isGlobalPrivacyControlEnabled,
  disableSharing = (): boolean => setTemplateUsageSharingEnabled(false),
  clearTelemetry = clearTelemetryQueue,
): boolean {
  if (!globalPrivacyControlEnabled()) return false;
  disableSharing();
  void clearTelemetry();
  return true;
}

export function bootstrapAggregateTelemetry(): void {
  if (!isAggregateTelemetryEnabled()) return;
  enforceGlobalPrivacyControl();
  bindPreferenceControl();

  if (location.pathname === '/templates/' || location.pathname === '/templates') {
    scheduleIdle(() => {
      void import('./counts')
        .then(({ dispatchTemplateUsageCounts }) => dispatchTemplateUsageCounts())
        .catch(() => undefined);
    });
  }

  if (location.pathname === '/editor/' || location.pathname === '/editor') {
    const flush = (): void => {
      void import('./reporter')
        .then(({ flushTemplateUsageQueue }) => flushTemplateUsageQueue())
        .catch(() => undefined);
    };
    scheduleIdle(flush);
    window.addEventListener('online', flush);
  }
}
