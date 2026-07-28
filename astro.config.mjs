import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

const site = process.env.PUBLIC_SITE_URL ?? 'https://openmermaid.example';
const telemetryMode = process.env.PUBLIC_TELEMETRY_MODE ?? 'off';
if (!['off', 'aggregate'].includes(telemetryMode)) {
  throw new Error('PUBLIC_TELEMETRY_MODE must be either "off" or "aggregate".');
}

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    preact(),
    sitemap({
      filter: (page) => !page.includes('/renderer/'),
    }),
  ],
  build: {
    inlineStylesheets: 'never',
    assets: '_assets',
  },
  markdown: {
    syntaxHighlight: false,
  },
  vite: {
    build: {
      chunkSizeWarningLimit: 600,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replaceAll('\\', '/');
            if (/\/src\/data\/default-source\.ts$/u.test(normalized)) {
              return 'editor-default';
            }
            if (
              /\/src\/(?:data\/templates|lib\/mermaid-language\/catalog)\.ts$/u.test(normalized)
            ) {
              return 'template-catalog';
            }
            if (
              /\/src\/(?:scripts\/template-catalogue|lib\/templates\/catalogue)\.ts$/u.test(
                normalized,
              )
            ) {
              return 'template-catalogue';
            }
            if (
              /\/(?:@codemirror|@lezer|@marijn|crelt|style-mod|w3c-keyname)(?:[+/]|$)/u.test(
                normalized,
              )
            ) {
              return 'codemirror';
            }
          },
        },
      },
    },
  },
});
