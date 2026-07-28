export const ADVERTISING_POLICY_VERSION = '2026-07-28';

export const adModes = ['off', 'placeholder', 'agency'] as const;
export type AdMode = (typeof adModes)[number];

export const adProviders = ['google-adsense'] as const;
export type AdProvider = (typeof adProviders)[number];

export const adPlacements = ['content-stripe'] as const;
export type AdPlacement = (typeof adPlacements)[number];

export const adRouteKinds = ['guide-detail', 'template-detail'] as const;
export type AdRouteKind = (typeof adRouteKinds)[number];

export interface AdvertisingEnvironmentV1 {
  PUBLIC_AD_MODE?: string | undefined;
  PUBLIC_AD_PROVIDER?: string | undefined;
  PUBLIC_ADSENSE_CLIENT?: string | undefined;
  PUBLIC_ADSENSE_SLOT?: string | undefined;
  PUBLIC_EDITOR_ORIGIN?: string | undefined;
  PUBLIC_INDEX_SITE?: string | undefined;
  PUBLIC_SITE_URL?: string | undefined;
}

interface AdvertisingConfigBaseV1 {
  schemaVersion: 1;
  policyVersion: typeof ADVERTISING_POLICY_VERSION;
  placement: 'content-stripe';
  allowedRouteKinds: readonly AdRouteKind[];
}

export interface AdvertisingOffConfigV1 extends AdvertisingConfigBaseV1 {
  mode: 'off';
}

export interface AdvertisingPlaceholderConfigV1 extends AdvertisingConfigBaseV1 {
  mode: 'placeholder';
}

export interface GoogleAdSenseConfigV1 extends AdvertisingConfigBaseV1 {
  mode: 'agency';
  provider: 'google-adsense';
  publicOrigin: string;
  editorOrigin: string;
  client: `ca-pub-${string}`;
  slot: string;
  consentStrategy: 'google-privacy-messaging';
}

export type AdvertisingConfigV1 =
  AdvertisingOffConfigV1 | AdvertisingPlaceholderConfigV1 | GoogleAdSenseConfigV1;

export interface AdvertisingConfigResultV1 {
  config: AdvertisingConfigV1;
  errors: readonly string[];
}

const baseConfig = {
  schemaVersion: 1,
  policyVersion: ADVERTISING_POLICY_VERSION,
  placement: 'content-stripe',
  allowedRouteKinds: adRouteKinds,
} as const;

function parseHttpsOrigin(
  value: string | undefined,
  name: string,
  errors: string[],
): URL | undefined {
  if (value === undefined || value.trim() === '') {
    errors.push(`${name} is required when PUBLIC_AD_MODE=agency.`);
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      errors.push(`${name} must be an HTTPS origin without credentials, path, query, or fragment.`);
      return undefined;
    }
    return parsed;
  } catch {
    errors.push(`${name} must be a valid absolute HTTPS origin.`);
    return undefined;
  }
}

export function parseAdvertisingEnvironment(
  environment: AdvertisingEnvironmentV1,
): AdvertisingConfigResultV1 {
  const mode = environment.PUBLIC_AD_MODE ?? 'off';
  const errors: string[] = [];

  if (!adModes.includes(mode as AdMode)) {
    return {
      config: { ...baseConfig, mode: 'off' },
      errors: ['PUBLIC_AD_MODE must be "off", "placeholder", or "agency".'],
    };
  }

  if (mode === 'off') {
    return { config: { ...baseConfig, mode }, errors };
  }

  if (mode === 'placeholder') {
    if (environment.PUBLIC_INDEX_SITE === 'true') {
      errors.push('PUBLIC_AD_MODE=placeholder is forbidden in an indexed build.');
    }
    return { config: { ...baseConfig, mode }, errors };
  }

  if (environment.PUBLIC_AD_PROVIDER !== 'google-adsense') {
    errors.push('PUBLIC_AD_PROVIDER must be "google-adsense" when PUBLIC_AD_MODE=agency.');
  }
  if (environment.PUBLIC_INDEX_SITE !== 'true') {
    errors.push('PUBLIC_AD_MODE=agency is permitted only in an explicitly indexed release build.');
  }

  const publicOrigin = parseHttpsOrigin(environment.PUBLIC_SITE_URL, 'PUBLIC_SITE_URL', errors);
  const editorOrigin = parseHttpsOrigin(
    environment.PUBLIC_EDITOR_ORIGIN,
    'PUBLIC_EDITOR_ORIGIN',
    errors,
  );
  if (publicOrigin?.hostname === editorOrigin?.hostname) {
    errors.push(
      'PUBLIC_EDITOR_ORIGIN must use a different hostname from PUBLIC_SITE_URL to isolate local documents from agency code.',
    );
  }

  const client = environment.PUBLIC_ADSENSE_CLIENT;
  if (client === undefined || !/^ca-pub-\d{16}$/u.test(client)) {
    errors.push('PUBLIC_ADSENSE_CLIENT must match ca-pub- followed by 16 digits.');
  }
  const slot = environment.PUBLIC_ADSENSE_SLOT;
  if (slot === undefined || !/^\d{1,20}$/u.test(slot)) {
    errors.push('PUBLIC_ADSENSE_SLOT must contain 1 to 20 digits.');
  }

  return {
    config: {
      ...baseConfig,
      mode: 'agency',
      provider: 'google-adsense',
      publicOrigin: publicOrigin?.origin ?? 'https://invalid.example',
      editorOrigin: editorOrigin?.origin ?? 'https://invalid-editor.example',
      client: (client ?? 'ca-pub-0000000000000000') as `ca-pub-${string}`,
      slot: slot ?? '0',
      consentStrategy: 'google-privacy-messaging',
    },
    errors,
  };
}

export function isAdvertisingAllowed(config: AdvertisingConfigV1, routeKind: AdRouteKind): boolean {
  return config.mode !== 'off' && config.allowedRouteKinds.includes(routeKind);
}
