import { expect, test } from '@playwright/test';

const aggregateBuild = process.env.PUBLIC_TELEMETRY_MODE === 'aggregate';

test.describe('optional aggregate template telemetry', () => {
  test.skip(!aggregateBuild, 'Runs only against the separately built aggregate artifact.');

  test('requires opt-in, sends the exact minimal event, and honors Global Privacy Control', async ({
    page,
  }) => {
    const reportedBodies: unknown[] = [];
    await page.route('**/api/telemetry/v1/template-uses', async (route) => {
      reportedBodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/editor/?template=gantt-starter');
    await expect(page.locator('#document-title')).toHaveValue('Gantt chart');
    await expect.poll(() => new URL(page.url()).search).toBe('');
    await page.waitForTimeout(200);
    expect(reportedBodies).toEqual([]);

    await page.goto('/privacy/');
    const sharing = page.getByLabel('Share privacy-minimized template usage');
    await expect(sharing).not.toBeChecked();
    await sharing.check();
    await expect(page.locator('[data-template-telemetry-status]')).toHaveText(
      'Sharing is on for future template applications.',
    );

    await page.goto('/editor/?template=sequence-starter');
    await expect(page.locator('#document-title')).toHaveValue('Sequence diagram');
    await expect.poll(() => reportedBodies.length).toBe(1);
    expect(reportedBodies[0]).toMatchObject({
      schemaVersion: 1,
      events: [
        {
          kind: 'template_applied',
          templateId: 'sequence-starter',
          catalogVersion: '11.16.0-v2',
        },
      ],
    });
    const serialized = JSON.stringify(reportedBodies[0]);
    expect(serialized).not.toMatch(
      /source|title|document|fragment|query|search|filter|referrer|userAgent/iu,
    );

    reportedBodies.length = 0;
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'globalPrivacyControl', {
        configurable: true,
        get: () => true,
      });
    });
    await page.goto('/privacy/');
    await expect(sharing).toBeDisabled();
    await expect(sharing).not.toBeChecked();
    await expect(page.locator('[data-template-telemetry-status]')).toContainText(
      'Global Privacy Control',
    );

    await page.goto('/editor/?template=class-starter');
    await expect(page.locator('#document-title')).toHaveValue('Class diagram');
    await page.waitForTimeout(200);
    expect(reportedBodies).toEqual([]);
  });
});
