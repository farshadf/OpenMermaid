import { readFile } from 'node:fs/promises';

import { expect, test, type Download, type Page } from '@playwright/test';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const UNSAFE_SVG_MARKUP =
  /<(?:script|iframe|object|embed|image|feImage|foreignObject|animate|set)\b|\son[a-z]+\s*=|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|@import/iu;

const hostileSources = [
  {
    name: 'hostile frontmatter configuration',
    marker: 'FRONTMATTER_CONTAINED',
    source: `---
title: Frontmatter containment
config:
  securityLevel: loose
  startOnLoad: true
  maxTextSize: 999999999
  suppressErrorRendering: false
  themeCSS: |
    @import url("https://attacker.invalid/frontmatter.css");
    .node { fill: url("https://attacker.invalid/frontmatter.svg"); }
---
flowchart LR
  A[FRONTMATTER_CONTAINED] --> B[Safe target]`,
  },
  {
    name: 'executable and external click directives',
    marker: 'CLICK_CONTAINED',
    source: `flowchart LR
  A[CLICK_CONTAINED] --> B[Safe target]
  click A "javascript:alert('openmermaid')" "Executable URL"
  click B "https://attacker.invalid/click" "External URL"`,
  },
  {
    name: 'hostile HTML labels',
    marker: 'HTML_CSS_CONTAINED',
    source: `flowchart LR
  A["<img src='https://attacker.invalid/pixel.png' onerror='alert(1)'> HTML_CSS_CONTAINED"] --> B["<script>alert('unsafe')</script> Safe target"]`,
  },
] as const;

interface BoundaryProbe {
  readonly externalRequests: string[];
  readonly unexpectedNavigations: string[];
  readonly dialogs: string[];
  readonly popups: string[];
}

function isUnexpectedNetworkUrl(value: string): boolean {
  const url = new URL(value);
  return (url.protocol === 'http:' || url.protocol === 'https:') && !LOCAL_HOSTS.has(url.hostname);
}

async function installBoundaryProbe(page: Page): Promise<BoundaryProbe> {
  const probe: BoundaryProbe = {
    externalRequests: [],
    unexpectedNavigations: [],
    dialogs: [],
    popups: [],
  };

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (isUnexpectedNetworkUrl(url)) {
      probe.externalRequests.push(url);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  page.on('framenavigated', (frame) => {
    const url = frame.url();
    if (isUnexpectedNetworkUrl(url)) probe.unexpectedNavigations.push(url);
  });
  page.on('dialog', (dialog) => {
    probe.dialogs.push(`${dialog.type()}:${dialog.message()}`);
    void dialog.dismiss();
  });
  page.on('popup', (popup) => {
    probe.popups.push(popup.url());
    void popup.close();
  });

  return probe;
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor/');
  await expect(page.getByLabel('Mermaid diagram source')).toBeVisible();
}

async function renderSource(page: Page, source: string): Promise<void> {
  await page.getByLabel('Mermaid diagram source').fill(source);
  await expect(page.locator('.render-state')).toHaveAttribute('data-state', 'ready', {
    timeout: 30_000,
  });
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path);
}

function expectBoundaryIntact(page: Page, probe: BoundaryProbe): void {
  expect(page.url()).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):4321\/editor\/$/u);
  expect(probe.externalRequests).toEqual([]);
  expect(probe.unexpectedNavigations).toEqual([]);
  expect(probe.dialogs).toEqual([]);
  expect(probe.popups).toEqual([]);
}

for (const hostile of hostileSources) {
  test(`contains ${hostile.name} inside the real renderer`, async ({ page }) => {
    const probe = await installBoundaryProbe(page);
    await openEditor(page);
    await renderSource(page, hostile.source);

    const iframe = page.locator('iframe.preview-frame');
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');
    const frameSource = await iframe.getAttribute('src');
    expect(frameSource).not.toBeNull();
    const frameUrl = new URL(frameSource ?? '', page.url());
    expect(frameUrl.origin).toBe(new URL(page.url()).origin);
    expect(frameUrl.pathname).toBe('/renderer/');
    const frameParameters = new URLSearchParams(frameUrl.hash.slice(1));
    expect(frameParameters.get('v')).toBe('1');
    expect(frameParameters.get('session')).toMatch(/^[A-Za-z0-9_-]+$/u);

    const renderer = page.frameLocator('iframe.preview-frame');
    const svg = renderer.locator('[data-renderer-scene] svg');
    await expect(svg).toHaveCount(1);
    await expect(svg).toContainText(hostile.marker);
    const markup = await renderer.locator('[data-renderer-scene]').innerHTML();
    expect(markup).not.toMatch(UNSAFE_SVG_MARKUP);
    expect(markup).not.toContain('attacker.invalid');

    const links = renderer.locator('[data-renderer-scene] a');
    for (let index = 0; index < (await links.count()); index += 1) {
      await links.nth(index).click({ force: true });
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );

    expectBoundaryIntact(page, probe);
  });
}

test('exports sanitized bytes from the current hostile revision as valid SVG and PNG', async ({
  page,
}) => {
  const probe = await installBoundaryProbe(page);
  await openEditor(page);
  await page.locator('#document-title').fill('Renderer security boundary');

  await renderSource(page, 'flowchart LR\n  STALE_EXPORT_SENTINEL --> Old');

  const currentSource = `---
title: Current security export
config:
  securityLevel: loose
  themeCSS: |
    @import url("https://attacker.invalid/export.css");
    .node { fill: url("https://attacker.invalid/export.svg"); }
---
flowchart TB
  A[CURRENT_EXPORT_SENTINEL] --> B[Sanitized output]
  B --> C[Third node]
  click A "javascript:alert('export')" "Executable URL"
  click B "https://attacker.invalid/export" "External URL"`;

  await page.getByLabel('Mermaid diagram source').fill(currentSource);
  await expect(
    page.frameLocator('iframe.preview-frame').locator('[data-renderer-scene] svg'),
  ).toContainText('CURRENT_EXPORT_SENTINEL', { timeout: 30_000 });
  await expect(page.locator('.render-state')).toHaveAttribute('data-state', 'ready', {
    timeout: 30_000,
  });

  await page.getByRole('button', { name: /Export/ }).click();
  await expect(page.getByRole('button', { name: /Sanitized SVG/ })).toBeEnabled();

  const [svgDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Sanitized SVG/ }).click(),
  ]);
  expect(svgDownload.suggestedFilename()).toBe('Renderer security boundary.svg');
  const svgBytes = await downloadBytes(svgDownload);
  const svgMarkup = svgBytes.toString('utf8');

  expect(svgMarkup).not.toContain('attacker.invalid');
  expect(svgMarkup).not.toMatch(UNSAFE_SVG_MARKUP);

  const svgDimensions = await page.evaluate((markup) => {
    const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const root = parsed.documentElement;
    const viewBox = root
      .getAttribute('viewBox')
      ?.trim()
      .split(/[\s,]+/u)
      .map(Number);
    return {
      root: root.localName,
      parserErrors: parsed.querySelectorAll('parsererror').length,
      text: root.textContent,
      viewBox,
    };
  }, svgMarkup);
  expect(svgDimensions.root).toBe('svg');
  expect(svgDimensions.parserErrors).toBe(0);
  expect(svgDimensions.text).toContain('CURRENT_EXPORT_SENTINEL');
  expect(svgDimensions.text).not.toContain('STALE_EXPORT_SENTINEL');
  expect(svgDimensions.viewBox).toHaveLength(4);
  expect(svgDimensions.viewBox?.every(Number.isFinite)).toBe(true);

  await page.getByLabel('PNG scale').selectOption('1');
  await page.getByLabel('PNG background').selectOption('dark');
  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download PNG at 1×/ }).click(),
  ]);
  expect(pngDownload.suggestedFilename()).toBe('Renderer security boundary.png');
  const png = await downloadBytes(pngDownload);

  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  expect(png.subarray(-8, -4).toString('ascii')).toBe('IEND');
  const pngWidth = png.readUInt32BE(16);
  const pngHeight = png.readUInt32BE(20);
  const viewBox = svgDimensions.viewBox;
  expect(viewBox).toBeDefined();
  expect(pngWidth).toBe(Math.ceil(viewBox?.[2] ?? 0));
  expect(pngHeight).toBe(Math.ceil(viewBox?.[3] ?? 0));
  expect(png.byteLength).toBeGreaterThan(100);

  expectBoundaryIntact(page, probe);
});
