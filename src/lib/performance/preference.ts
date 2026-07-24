export const LOCAL_VITALS_PREFERENCE_KEY = 'open-mermaid:vitals-history:v1';
const ENABLED_VALUE = 'enabled';

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function isLocalVitalsHistoryEnabled(storage = browserStorage()): boolean {
  if (storage === undefined) return false;
  try {
    return storage.getItem(LOCAL_VITALS_PREFERENCE_KEY) === ENABLED_VALUE;
  } catch {
    return false;
  }
}

export function setLocalVitalsHistoryEnabled(
  enabled: boolean,
  storage = browserStorage(),
): boolean {
  if (storage === undefined) return false;
  try {
    if (enabled) storage.setItem(LOCAL_VITALS_PREFERENCE_KEY, ENABLED_VALUE);
    else storage.removeItem(LOCAL_VITALS_PREFERENCE_KEY);
    return true;
  } catch {
    return false;
  }
}
