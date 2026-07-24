import { readFile } from 'node:fs/promises';

import { chromium } from '@playwright/test';

const sourceUrl = new URL('../public/og-default.svg', import.meta.url);
const outputUrl = new URL('../public/og-default.png', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: 1_200, height: 630 },
  });
  const page = await context.newPage();
  await page.setContent(
    `<style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}svg{display:block;width:1200px;height:630px}</style>${source}`,
    { waitUntil: 'load' },
  );
  await page.screenshot({
    path: outputUrl.pathname,
    type: 'png',
    clip: { x: 0, y: 0, width: 1_200, height: 630 },
  });
  await context.close();
} finally {
  await browser.close();
}

console.log('Generated public/og-default.png at 1200x630.');
