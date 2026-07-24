import { expect, test } from '@playwright/test';

async function storedVitalSamples(page: import('@playwright/test').Page): Promise<unknown[]> {
  return page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = indexedDB.open('openmermaid-performance', 1);
        request.onerror = () =>
          reject(request.error ?? new Error('Could not open vitals storage.'));
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('vital-samples')) {
            database.createObjectStore('vital-samples', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('vital-samples', 'readonly');
          const getAll = transaction.objectStore('vital-samples').getAll();
          getAll.onerror = () => reject(getAll.error ?? new Error('Could not read stored vitals.'));
          getAll.onsuccess = () => resolve(getAll.result as unknown[]);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

test('performance diagnostics are local-only and history defaults off', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const hostname = new URL(request.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(hostname)) externalRequests.push(request.url());
  });

  await page.goto('/performance/#private-fragment-must-not-be-recorded');
  await expect(page.getByRole('heading', { name: 'Performance and Web Vitals' })).toBeVisible();
  await expect(page.getByLabel('Save 30-day history in this browser')).not.toBeChecked();
  await expect(page.locator('#vitals-live-status')).not.toContainText('Starting');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        if (!('databases' in indexedDB)) return true;
        const databases = await indexedDB.databases();
        return !databases.some(({ name }) => name === 'openmermaid-performance');
      }),
    )
    .toBe(true);
  expect(externalRequests).toEqual([]);
});

test('opt-in history persists minimized samples and can be cleared', async ({ page }) => {
  await page.goto('/performance/#secret-fragment-marker');
  const toggle = page.getByLabel('Save 30-day history in this browser');
  await expect(page.locator("[data-current-vital='TTFB'] [data-vital-value]")).not.toHaveText(
    'Waiting',
  );
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('open-mermaid:vitals-history:v1')))
    .toBe('enabled');
  await expect.poll(async () => (await storedVitalSamples(page)).length).toBeGreaterThan(0);

  const serialized = JSON.stringify(await storedVitalSamples(page));
  expect(serialized).not.toContain('secret-fragment-marker');
  expect(serialized).not.toContain('source');
  expect(serialized).not.toContain('userAgent');
  expect(serialized).not.toContain('entries');

  await page.reload();
  await expect(toggle).toBeChecked();
  await expect(page.locator('#vitals-history-summary')).toContainText('retained samples');
  await page.getByRole('button', { name: 'Clear performance history' }).click();
  await expect(toggle).not.toBeChecked();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('open-mermaid:vitals-history:v1')))
    .toBeNull();
  await expect.poll(async () => (await storedVitalSamples(page)).length).toBe(0);
});
