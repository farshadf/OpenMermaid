import { expect, test } from '@playwright/test';

const adMode = process.env.PUBLIC_AD_MODE ?? 'off';

interface AdvertisingManifest {
  mode: string;
}

test('advertising remains limited to eligible public detail routes', async ({ page, request }) => {
  await page.goto('/guides/flowcharts/');
  const slots = page.locator('[data-ad-placement="content-stripe"]');

  if (adMode === 'off') {
    await expect(slots).toHaveCount(0);
    expect((await request.get('/openmermaid-advertising-manifest.json')).status()).toBe(404);
  } else {
    await expect(slots).toHaveCount(1);
    const manifest = await request.get('/openmermaid-advertising-manifest.json');
    expect(manifest.ok()).toBe(true);
    const payload = (await manifest.json()) as AdvertisingManifest;
    expect(payload.mode).toBe(adMode);
  }

  await page.goto('/');
  await expect(page.locator('[data-ad-placement]')).toHaveCount(0);
  await page.goto('/editor/');
  await expect(page.locator('[data-ad-placement], [data-ad-provider]')).toHaveCount(0);
});

test('placeholder inventory is inert and agency inventory is origin gated', async ({ page }) => {
  test.skip(adMode === 'off', 'No advertising inventory is expected in the default build.');

  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(request.url());
  });

  await page.goto('/templates/flowchart-starter/');
  if (adMode === 'placeholder') {
    await expect(page.getByLabel('Advertisement preview')).toBeVisible();
    await expect(page.locator('[data-ad-provider]')).toHaveCount(0);
  } else {
    await expect(page.getByLabel('Advertisement')).toBeVisible();
    await expect(page.locator('[data-ad-provider="google-adsense"]')).toHaveCount(1);
    expect(await page.locator('[data-agency-ad-slot]').getAttribute('data-public-origin')).toBe(
      process.env.PUBLIC_SITE_URL,
    );
  }

  // Local preview does not impersonate the configured production origin, so it
  // must never generate agency inventory or invalid test traffic.
  expect(externalRequests).toEqual([]);
});
