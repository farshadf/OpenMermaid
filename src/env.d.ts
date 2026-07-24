/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_INDEX_SITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
