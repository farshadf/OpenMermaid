import { readFile } from 'node:fs/promises';

import { expect, test, type Download, type Page } from '@playwright/test';

const LARGE_HORIZONTAL_DIAGRAM = `flowchart LR
  A01[First planning step] --> A02[Second planning step]
  A02 --> A03[Third planning step]
  A03 --> A04[Fourth planning step]
  A04 --> A05[Fifth planning step]
  A05 --> A06[Sixth planning step]
  A06 --> A07[Seventh planning step]
  A07 --> A08[Eighth planning step]
  A08 --> A09[Ninth planning step]
  A09 --> A10[Tenth planning step]
  A10 --> A11[Eleventh planning step]
  A11 --> A12[Twelfth planning step]`;

const LARGE_VERTICAL_DIAGRAM = `flowchart TD
  A01[First review step] --> A02[Second review step]
  A02 --> A03[Third review step]
  A03 --> A04[Fourth review step]
  A04 --> A05[Fifth review step]
  A05 --> A06[Sixth review step]
  A06 --> A07[Seventh review step]
  A07 --> A08[Eighth review step]
  A08 --> A09[Ninth review step]
  A09 --> A10[Tenth review step]
  A10 --> A11[Eleventh review step]
  A11 --> A12[Twelfth review step]`;

const PNG_DIAGRAM = `flowchart LR
  Source[Open Mermaid source] --> Export[Browser PNG export]`;

interface ViewportState {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly corners: readonly (readonly number[])[];
}

const expectedBackgroundPixels = {
  light: [255, 255, 255, 255],
  dark: [11, 16, 32, 255],
} as const;

async function openRenderedEditor(
  page: Page,
  source: string,
  renderTimeout = 30_000,
): Promise<void> {
  await page.goto('/editor/');
  await page.getByLabel('Mermaid diagram source').fill(source);
  await expect(page.locator('.render-state')).toHaveAttribute('data-state', 'ready', {
    timeout: renderTimeout,
  });
  await expect(
    page.frameLocator('iframe.preview-frame').locator('[data-renderer-scene] svg'),
  ).toHaveCount(1);
}

async function readViewportState(page: Page): Promise<ViewportState> {
  return page
    .frameLocator('iframe.preview-frame')
    .locator('[data-renderer-scene]')
    .evaluate((scene) => {
      const matrix = new DOMMatrix((scene as HTMLElement).style.transform);
      const normalize = (value: number) =>
        Math.abs(value) < 0.000001 ? 0 : Number(value.toFixed(6));
      return {
        x: normalize(matrix.e),
        y: normalize(matrix.f),
        scale: normalize(matrix.a),
      };
    });
}

async function readFitGeometry(page: Page): Promise<{
  centeredDelta: number;
  contained: boolean;
  limitingUnusedSpace: number;
}> {
  return page
    .frameLocator('iframe.preview-frame')
    .locator('[data-renderer-surface]')
    .evaluate((surface) => {
      const svg = surface.querySelector('[data-renderer-scene] svg');
      if (!(svg instanceof SVGSVGElement)) throw new Error('Preview SVG is missing.');
      const surfaceBounds = surface.getBoundingClientRect();
      const svgBounds = svg.getBoundingClientRect();
      const horizontalCenterDelta = Math.abs(
        svgBounds.left + svgBounds.width / 2 - (surfaceBounds.left + surfaceBounds.width / 2),
      );
      const verticalCenterDelta = Math.abs(
        svgBounds.top + svgBounds.height / 2 - (surfaceBounds.top + surfaceBounds.height / 2),
      );
      return {
        centeredDelta: Math.max(horizontalCenterDelta, verticalCenterDelta),
        contained:
          svgBounds.left >= surfaceBounds.left &&
          svgBounds.top >= surfaceBounds.top &&
          svgBounds.right <= surfaceBounds.right &&
          svgBounds.bottom <= surfaceBounds.bottom,
        limitingUnusedSpace: Math.min(
          surfaceBounds.width - svgBounds.width,
          surfaceBounds.height - svgBounds.height,
        ),
      };
    });
}

async function expectPreviewToFit(page: Page): Promise<void> {
  await expect.poll(async () => (await readFitGeometry(page)).contained).toBe(true);
  await expect.poll(async () => (await readFitGeometry(page)).centeredDelta).toBeLessThan(2);
  await expect
    .poll(async () => (await readFitGeometry(page)).limitingUnusedSpace)
    .toBeGreaterThanOrEqual(62);
  await expect
    .poll(async () => (await readFitGeometry(page)).limitingUnusedSpace)
    .toBeLessThanOrEqual(66);
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path);
}

function readSvgDimensions(markup: string): { width: number; height: number } {
  const viewBox = /\bviewBox=["']([^"']+)["']/iu
    .exec(markup)?.[1]
    ?.trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (
    viewBox?.length !== 4 ||
    !viewBox.every(Number.isFinite) ||
    viewBox[2] === undefined ||
    viewBox[3] === undefined ||
    viewBox[2] <= 0 ||
    viewBox[3] <= 0
  ) {
    throw new Error('The exported SVG does not expose positive viewBox dimensions.');
  }
  return { width: viewBox[2], height: viewBox[3] };
}

async function decodePng(page: Page, bytes: Buffer): Promise<DecodedPng> {
  return page.evaluate(async (base64) => {
    const binary = atob(base64);
    const encoded = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([encoded], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) throw new Error('Canvas pixel inspection is unavailable.');
      context.drawImage(bitmap, 0, 0);
      const points = [
        [0, 0],
        [bitmap.width - 1, 0],
        [0, bitmap.height - 1],
        [bitmap.width - 1, bitmap.height - 1],
      ] as const;
      return {
        width: bitmap.width,
        height: bitmap.height,
        corners: points.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]),
      };
    } finally {
      bitmap.close();
    }
  }, bytes.toString('base64'));
}

test.describe('preview interaction and PNG export contracts', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Deep byte checks run in Chromium.');

  test('operates zoom, fit, reset, wheel pan, and fullscreen from the real preview', async ({
    page,
  }) => {
    await openRenderedEditor(page, LARGE_HORIZONTAL_DIAGRAM);

    const separator = page.getByRole('separator', {
      name: 'Resize source and preview panes',
    });
    await expect(separator).toHaveAttribute('aria-valuenow', '50');
    await separator.press('End');
    await expect(separator).toHaveAttribute('aria-valuenow', '75');
    await separator.press('Home');
    await expect(separator).toHaveAttribute('aria-valuenow', '25');

    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    const fit = page.getByRole('button', { name: 'Fit diagram' });
    const reset = page.getByRole('button', { name: 'Reset view' });
    const fullscreen = page.getByRole('button', { name: 'Fullscreen preview' });
    await expect(zoomOut).toBeEnabled();
    await expect(zoomIn).toBeEnabled();
    await expect(fit).toBeEnabled();
    await expect(reset).toBeEnabled();
    await expect(fullscreen).toBeEnabled();

    await reset.click();
    await expect.poll(() => readViewportState(page)).toEqual({ scale: 1, x: 0, y: 0 });

    await zoomIn.click();
    await expect.poll(async () => (await readViewportState(page)).scale).toBeCloseTo(1.2, 5);
    await expect(
      page.frameLocator('iframe.preview-frame').locator('[data-renderer-status]'),
    ).toHaveText('Preview zoom 120%.');

    await zoomOut.click();
    await expect.poll(async () => (await readViewportState(page)).scale).toBeCloseTo(1, 5);

    const surface = page.frameLocator('iframe.preview-frame').locator('[data-renderer-surface]');
    await surface.dispatchEvent('wheel', {
      deltaX: 32,
      deltaY: 48,
      deltaMode: 0,
      clientX: 100,
      clientY: 100,
    });
    await expect.poll(() => readViewportState(page)).toEqual({ scale: 1, x: -32, y: -48 });

    await reset.click();
    await expect.poll(() => readViewportState(page)).toEqual({ scale: 1, x: 0, y: 0 });
    await surface.focus();
    await surface.press('ArrowRight');
    await expect.poll(async () => (await readViewportState(page)).x).toBe(-24);
    await surface.press('=');
    await expect.poll(async () => (await readViewportState(page)).scale).toBeCloseTo(1.2, 5);
    await surface.press('0');
    await expect.poll(() => readViewportState(page)).toEqual({ scale: 1, x: 0, y: 0 });
    await surface.press('f');
    await expectPreviewToFit(page);

    await reset.click();
    await fit.click();
    await expectPreviewToFit(page);

    const iframe = page.locator('iframe.preview-frame');
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(iframe).toHaveAttribute('allow', 'fullscreen');
    expect(await page.evaluate(() => document.fullscreenEnabled)).toBe(true);
    await fullscreen.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.fullscreenElement?.classList.contains('preview-frame') ?? false,
        ),
      )
      .toBe(true);
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  });

  test('exports 1x, 2x, and 3x PNG bytes with transparent, light, and dark backgrounds', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openRenderedEditor(page, PNG_DIAGRAM);
    await page.locator('#document-title').fill('PNG matrix');
    await page.getByRole('button', { name: /Export/ }).click();

    const [svgDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Sanitized SVG/ }).click(),
    ]);
    const svgDimensions = readSvgDimensions((await downloadBytes(svgDownload)).toString('utf8'));

    for (const background of ['transparent', 'light', 'dark'] as const) {
      await page.getByLabel('PNG background').selectOption(background);
      await expect(page.getByRole('button', { name: /Download PNG/ })).toBeEnabled({
        timeout: 30_000,
      });

      for (const scale of [1, 2, 3] as const) {
        await page.getByLabel('PNG scale').selectOption(String(scale));
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('button', { name: `Download PNG at ${String(scale)}×` }).click(),
        ]);
        expect(download.suggestedFilename()).toBe('PNG matrix.png');
        const bytes = await downloadBytes(download);

        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
        expect(bytes.subarray(-8, -4).toString('ascii')).toBe('IEND');

        const expectedWidth = Math.ceil(svgDimensions.width * scale);
        const expectedHeight = Math.ceil(svgDimensions.height * scale);
        expect(bytes.readUInt32BE(16)).toBe(expectedWidth);
        expect(bytes.readUInt32BE(20)).toBe(expectedHeight);

        const decoded = await decodePng(page, bytes);
        expect(decoded.width).toBe(expectedWidth);
        expect(decoded.height).toBe(expectedHeight);
        for (const pixel of decoded.corners) {
          if (background === 'transparent') {
            expect(pixel[3]).toBe(0);
          } else {
            expect(pixel).toEqual(expectedBackgroundPixels[background]);
          }
        }
      }
    }
  });
});

test('fit centers and contains a tall diagram at the largest useful scale', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await openRenderedEditor(page, LARGE_VERTICAL_DIAGRAM, 60_000);
  if (testInfo.project.name === 'mobile-webkit') {
    await page.getByRole('tab', { name: 'Preview' }).click();
  }
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.getByRole('button', { name: 'Fit diagram' }).click();
  await expectPreviewToFit(page);
});

test('supports touch panning and two-pointer pinch zoom in mobile WebKit', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit', 'The touch contract runs on mobile WebKit.');

  await openRenderedEditor(page, LARGE_HORIZONTAL_DIAGRAM);
  await page.getByRole('tab', { name: 'Preview' }).click();
  const reset = page.getByRole('button', { name: 'Reset view' });
  await expect(reset).toBeEnabled();
  await reset.click();

  const surface = page.frameLocator('iframe.preview-frame').locator('[data-renderer-surface]');
  await surface.evaluate((element) => {
    const target = element as HTMLElement;
    target.setPointerCapture = () => undefined;
    const dispatch = (type: string, init: PointerEventInit) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          buttons: type === 'pointerup' ? 0 : 1,
          ...init,
        }),
      );
    dispatch('pointerdown', { pointerId: 1, clientX: 80, clientY: 90, isPrimary: true });
    dispatch('pointermove', { pointerId: 1, clientX: 116, clientY: 118, isPrimary: true });
    dispatch('pointerup', { pointerId: 1, clientX: 116, clientY: 118, isPrimary: true });
  });
  await expect.poll(() => readViewportState(page)).toEqual({ scale: 1, x: 36, y: 28 });

  await reset.click();
  await surface.evaluate((element) => {
    const target = element as HTMLElement;
    target.setPointerCapture = () => undefined;
    const dispatch = (type: string, init: PointerEventInit) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          buttons: type === 'pointerup' ? 0 : 1,
          ...init,
        }),
      );
    dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, isPrimary: true });
    dispatch('pointerdown', { pointerId: 2, clientX: 200, clientY: 100, isPrimary: false });
    dispatch('pointermove', { pointerId: 2, clientX: 250, clientY: 100, isPrimary: false });
    dispatch('pointerup', { pointerId: 2, clientX: 250, clientY: 100, isPrimary: false });
    dispatch('pointerup', { pointerId: 1, clientX: 100, clientY: 100, isPrimary: true });
  });
  await expect.poll(async () => (await readViewportState(page)).scale).toBeCloseTo(1.5, 5);
});
