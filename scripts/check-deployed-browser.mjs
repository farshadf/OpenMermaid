import { chromium } from '@playwright/test';

const rawOrigin = process.argv[2];
if (!rawOrigin) throw new Error('Pass the loopback deployment origin as the first argument.');

const origin = new URL(rawOrigin);
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.pathname !== '/') {
  throw new Error('The deployment browser check accepts only an HTTP 127.0.0.1 origin.');
}

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const unexpectedRequests = [];
  const browserErrors = [];

  page.on('request', (request) => {
    if (!request.url().startsWith(origin.href)) unexpectedRequests.push(request.url());
  });
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto(new URL('/editor/', origin).href, { waitUntil: 'networkidle' });

  const previewFrame = page.locator('iframe.preview-frame');
  if ((await previewFrame.getAttribute('sandbox')) !== 'allow-scripts') {
    throw new Error('The deployed preview iframe sandbox contract changed.');
  }

  await page.getByRole('button', { name: 'Render preview' }).click();
  await page.waitForFunction(
    () => /preview ready/iu.test(document.querySelector('.render-state')?.textContent ?? ''),
    undefined,
    { timeout: 30_000 },
  );
  await page.frameLocator('iframe.preview-frame').locator('[data-renderer-scene] svg').waitFor({
    state: 'visible',
    timeout: 30_000,
  });

  const generatedWrapper = '```mermaid\nflowchart LR\n  Generated --> Clean\n```';
  const cleanedSource = 'flowchart LR\n  Generated --> Clean';
  const source = page.getByLabel('Mermaid diagram source');
  await source.fill(generatedWrapper);
  await page.getByRole('button', { name: 'Clean up source' }).click();
  if ((await source.inputValue()) !== cleanedSource) {
    throw new Error('The deployed external-source cleanup workflow changed unexpectedly.');
  }
  await page.getByText(/Cleaned up source/iu).waitFor({ state: 'visible' });

  if (unexpectedRequests.length > 0) {
    throw new Error(`Unexpected external requests: ${unexpectedRequests.join(', ')}`);
  }
  if (browserErrors.length > 0) {
    throw new Error(`Browser console errors: ${browserErrors.join(' | ')}`);
  }

  await context.close();
  console.log('Deployed browser smoke passed: editor and sandboxed renderer are healthy.');
} finally {
  await browser.close();
}
