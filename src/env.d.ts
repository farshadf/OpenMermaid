/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_INDEX_SITE?: string;
  readonly PUBLIC_TELEMETRY_MODE?: 'off' | 'aggregate';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
