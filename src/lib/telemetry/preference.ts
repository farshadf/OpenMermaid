export const TEMPLATE_USAGE_PREFERENCE_KEY = 'open-mermaid:aggregate-template-usage:v1';
const ENABLED_VALUE = 'enabled';

interface NavigatorPrivacyPreference {
  readonly globalPrivacyControl?: unknown;
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function browserNavigator(): NavigatorPrivacyPreference | undefined {
  try {
    return window.navigator as NavigatorPrivacyPreference;
  } catch {
    return undefined;
  }
}

export function isGlobalPrivacyControlEnabled(
  navigatorValue: NavigatorPrivacyPreference | undefined = browserNavigator(),
): boolean {
  return navigatorValue?.globalPrivacyControl === true;
}

export function isTemplateUsageSharingEnabled(
  storage: Storage | undefined = browserStorage(),
  navigatorValue: NavigatorPrivacyPreference | undefined = browserNavigator(),
): boolean {
  if (storage === undefined || isGlobalPrivacyControlEnabled(navigatorValue)) return false;
  try {
    return storage.getItem(TEMPLATE_USAGE_PREFERENCE_KEY) === ENABLED_VALUE;
  } catch {
    return false;
  }
}

export function setTemplateUsageSharingEnabled(
  enabled: boolean,
  storage: Storage | undefined = browserStorage(),
  navigatorValue: NavigatorPrivacyPreference | undefined = browserNavigator(),
): boolean {
  if (storage === undefined) return false;
  try {
    if (enabled && !isGlobalPrivacyControlEnabled(navigatorValue)) {
      storage.setItem(TEMPLATE_USAGE_PREFERENCE_KEY, ENABLED_VALUE);
      return true;
    }
    storage.removeItem(TEMPLATE_USAGE_PREFERENCE_KEY);
    return false;
  } catch {
    return false;
  }
}
