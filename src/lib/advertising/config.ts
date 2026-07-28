import {
  parseAdvertisingEnvironment,
  type AdvertisingConfigV1,
  type AdvertisingEnvironmentV1,
} from './contracts';

const environment: AdvertisingEnvironmentV1 = {
  PUBLIC_AD_MODE: import.meta.env.PUBLIC_AD_MODE,
  PUBLIC_AD_PROVIDER: import.meta.env.PUBLIC_AD_PROVIDER,
  PUBLIC_ADSENSE_CLIENT: import.meta.env.PUBLIC_ADSENSE_CLIENT,
  PUBLIC_ADSENSE_SLOT: import.meta.env.PUBLIC_ADSENSE_SLOT,
  PUBLIC_EDITOR_ORIGIN: import.meta.env.PUBLIC_EDITOR_ORIGIN,
  PUBLIC_INDEX_SITE: import.meta.env.PUBLIC_INDEX_SITE,
  PUBLIC_SITE_URL: import.meta.env.PUBLIC_SITE_URL,
};

const result = parseAdvertisingEnvironment(environment);
if (result.errors.length > 0) {
  throw new Error(`Invalid advertising configuration:\n- ${result.errors.join('\n- ')}`);
}

export const advertisingConfig: AdvertisingConfigV1 = result.config;
