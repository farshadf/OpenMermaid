import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const staticRoutes = [
  '/',
  '/templates/',
  '/guides/',
  '/about/',
  '/privacy/',
  '/security/',
  '/performance/',
];

for (const route of staticRoutes) {
  test(`${route} is substantive, local-only, and has no editor runtime`, async ({ page }) => {
    const externalRequests: string[] = [];
    const editorScripts: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externalRequests.push(request.url());
      if (
        request.resourceType() === 'script' &&
        /(?:mermaid|codemirror|renderer)/iu.test(request.url())
      ) {
        editorScripts.push(request.url());
      }
    });

    const response = await page.goto(route);
    expect(response?.ok()).toBe(true);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', /^https?:\/\//u);
    expect(externalRequests).toEqual([]);
    expect(editorScripts).toEqual([]);

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    );
    expect(blocking).toEqual([]);
  });
}

test('editor shell has no serious or critical automated accessibility findings', async ({
  page,
}) => {
  await page.goto('/editor/');
  await expect(page.getByLabel('Mermaid diagram source')).toBeVisible();
  const results = await new AxeBuilder({ page }).exclude('iframe').analyze();
  const blocking = results.violations.filter(
    ({ impact }) => impact === 'serious' || impact === 'critical',
  );
  expect(blocking).toEqual([]);
});

test('crawler-facing text resources are served from the static artifact', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  await expect(robots.text()).resolves.toContain('Disallow: /renderer/');

  const machineIndex = await request.get('/llms.txt');
  expect(machineIndex.ok()).toBe(true);
  await expect(machineIndex.text()).resolves.toContain('# Open Mermaid');

  const sitemap = await request.get('/sitemap-index.xml');
  expect(sitemap.ok()).toBe(true);
  await expect(sitemap.text()).resolves.toContain('<sitemapindex');
});

test('unknown routes render the real 404 page', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/does not lead/i);
});
