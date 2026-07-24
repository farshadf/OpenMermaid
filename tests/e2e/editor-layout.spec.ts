import { expect, test, type Locator, type Page } from '@playwright/test';

const GANTT_DIAGRAM = `gantt
  title Documentation release
  dateFormat YYYY-MM-DD
  axisFormat %b %d
  section Prepare
  Draft content :done, draft, 2026-07-01, 3d
  Review :active, review, after draft, 2d
  section Publish
  Release :milestone, release, after review, 0d`;

const TALL_FLOWCHART = `flowchart TD
  A01[Discover] --> A02[Define]
  A02 --> A03[Plan]
  A03 --> A04[Draft]
  A04 --> A05[Review]
  A05 --> A06[Revise]
  A06 --> A07[Approve]
  A07 --> A08[Prepare]
  A08 --> A09[Publish]
  A09 --> A10[Verify]
  A10 --> A11[Measure]
  A11 --> A12[Improve]`;

interface DiagramFit {
  readonly widthRatio: number;
  readonly horizontalCenterOffset: number;
  readonly verticalCenterOffset: number;
  readonly clipped: boolean;
}

async function openEditor(page: Page): Promise<Locator> {
  await page.goto('/editor/');
  const source = page.getByLabel('Mermaid diagram source');
  await expect(source).toBeVisible();
  return source;
}

async function waitForDiagram(page: Page, diagramType: RegExp): Promise<void> {
  await expect(page.locator('.render-state')).toContainText(diagramType, {
    timeout: 30_000,
  });
  await expect(
    page.frameLocator('iframe.preview-frame').locator('[data-renderer-scene] > svg'),
  ).toHaveCount(1);
}

async function measureAutomaticFit(page: Page): Promise<DiagramFit> {
  const surface = await page
    .frameLocator('iframe.preview-frame')
    .locator('[data-renderer-surface]')
    .boundingBox();
  const diagram = await page
    .frameLocator('iframe.preview-frame')
    .locator('[data-renderer-scene] > svg')
    .boundingBox();
  if (surface === null || diagram === null || surface.width <= 0 || surface.height <= 0) {
    return {
      widthRatio: 0,
      horizontalCenterOffset: Number.POSITIVE_INFINITY,
      verticalCenterOffset: Number.POSITIVE_INFINITY,
      clipped: true,
    };
  }

  const surfaceCenterX = surface.x + surface.width / 2;
  const surfaceCenterY = surface.y + surface.height / 2;
  const diagramCenterX = diagram.x + diagram.width / 2;
  const diagramCenterY = diagram.y + diagram.height / 2;
  const tolerance = 1;
  return {
    widthRatio: diagram.width / surface.width,
    horizontalCenterOffset: Math.abs(surfaceCenterX - diagramCenterX),
    verticalCenterOffset: Math.abs(surfaceCenterY - diagramCenterY),
    clipped:
      diagram.x < surface.x - tolerance ||
      diagram.y < surface.y - tolerance ||
      diagram.x + diagram.width > surface.x + surface.width + tolerance ||
      diagram.y + diagram.height > surface.y + surface.height + tolerance,
  };
}

test.describe('desktop editor canvas', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });
  test.skip(({ isMobile }) => isMobile, 'This contract covers desktop layout.');

  test('uses the available viewport and automatically fits a first Gantt preview', async ({
    page,
  }) => {
    const source = await openEditor(page);
    await source.fill(GANTT_DIAGRAM);
    await waitForDiagram(page, /gantt preview ready/iu);

    const appMain = await page.locator('.app-main').boundingBox();
    const workspace = await page.locator('.editor-workspace').boundingBox();
    const split = await page.locator('.split-workspace').boundingBox();
    const sourcePane = await page.locator('.source-pane').boundingBox();
    const previewPane = await page.locator('.preview-pane').boundingBox();
    const previewStage = await page.locator('.preview-stage').boundingBox();
    expect(appMain).not.toBeNull();
    expect(workspace).not.toBeNull();
    expect(split).not.toBeNull();
    expect(sourcePane).not.toBeNull();
    expect(previewPane).not.toBeNull();
    expect(previewStage).not.toBeNull();
    if (
      appMain === null ||
      workspace === null ||
      split === null ||
      sourcePane === null ||
      previewPane === null ||
      previewStage === null
    ) {
      return;
    }

    expect(workspace.height).toBeGreaterThanOrEqual(appMain.height * 0.98);
    expect(split.height).toBeGreaterThanOrEqual(appMain.height * 0.9);
    expect(sourcePane.height).toBeGreaterThanOrEqual(appMain.height * 0.9);
    expect(previewPane.height).toBeGreaterThanOrEqual(appMain.height * 0.9);
    expect(previewStage.height).toBeGreaterThanOrEqual(appMain.height * 0.8);
    expect(Math.abs(split.y + split.height - (appMain.y + appMain.height))).toBeLessThanOrEqual(2);
    expect(
      Math.abs(sourcePane.y + sourcePane.height - (appMain.y + appMain.height)),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(previewPane.y + previewPane.height - (appMain.y + appMain.height)),
    ).toBeLessThanOrEqual(2);

    await expect
      .poll(async () => (await measureAutomaticFit(page)).widthRatio)
      .toBeGreaterThan(0.75);
    const fit = await measureAutomaticFit(page);
    expect(fit.clipped).toBe(false);
    expect(fit.horizontalCenterOffset).toBeLessThanOrEqual(4);
    expect(fit.verticalCenterOffset).toBeLessThanOrEqual(4);
  });

  test('automatically refits a wide Gantt preview after a tall valid diagram', async ({ page }) => {
    const source = await openEditor(page);
    await source.fill(TALL_FLOWCHART);
    await waitForDiagram(page, /flowchart[\w-]* preview ready/iu);

    await source.fill(GANTT_DIAGRAM);
    await waitForDiagram(page, /gantt preview ready/iu);

    await expect
      .poll(async () => (await measureAutomaticFit(page)).widthRatio)
      .toBeGreaterThan(0.75);
    const fit = await measureAutomaticFit(page);
    expect(fit.clipped).toBe(false);
    expect(fit.horizontalCenterOffset).toBeLessThanOrEqual(4);
    expect(fit.verticalCenterOffset).toBeLessThanOrEqual(4);
  });
});
