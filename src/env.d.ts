/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_INDEX_SITE?: string;
  readonly PUBLIC_TELEMETRY_MODE?: 'off' | 'aggregate';
  readonly PUBLIC_EDITOR_ORIGIN?: string;
  readonly PUBLIC_AD_MODE?: 'off' | 'placeholder' | 'agency';
  readonly PUBLIC_AD_PROVIDER?: 'google-adsense';
  readonly PUBLIC_ADSENSE_CLIENT?: string;
  readonly PUBLIC_ADSENSE_SLOT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
