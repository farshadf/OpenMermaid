import { expect, test } from '@playwright/test';

import { diagramTemplates } from '../../src/data/templates';

for (const template of diagramTemplates) {
  test(`renders the pinned ${template.slug} contract fixture`, async ({ page, browserName }) => {
    test.skip(
      browserName !== 'chromium',
      'The pinned-family render contract runs once in Chromium.',
    );

    await page.goto('/editor/');
    const source = page.getByLabel('Mermaid diagram source');
    await expect(source).toBeVisible();
    await source.fill(template.source);

    await expect(page.locator('.render-state')).toHaveAttribute('data-state', 'ready', {
      timeout: 30_000,
    });
    const scene = page.frameLocator('iframe.preview-frame').locator('[data-renderer-scene]');
    await expect(scene.locator(':scope > svg')).toHaveCount(1);
    const markup = await scene.innerHTML();
    expect(markup).toMatch(/^<svg\b/iu);
    expect(markup).not.toMatch(/<(?:script|iframe|object|embed)\b|\son[a-z]+\s*=/iu);
  });
}
