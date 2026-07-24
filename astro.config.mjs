import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

const site = process.env.PUBLIC_SITE_URL ?? 'https://openmermaid.example';
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
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replaceAll('\\', '/');
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
