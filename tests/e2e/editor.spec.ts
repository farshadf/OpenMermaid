import { expect, test } from '@playwright/test';

const replacementSource = `sequenceDiagram
  participant User
  participant Browser
  User->>Browser: Edit locally
  Browser-->>User: Preview safely`;

async function replaceCodeMirrorSource(page: import('@playwright/test').Page, source: string) {
  const enhancement = page.getByRole('button', { name: 'Enable advanced editor' });
  if (await enhancement.isVisible()) await enhancement.click();
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  const usesMobileTabs = await page.getByRole('tab', { name: 'Preview' }).isVisible();
  await page.keyboard.press(
    usesMobileTabs || process.platform === 'darwin' ? 'Meta+A' : 'Control+A',
  );
  await page.keyboard.insertText(source);
}

async function showTabbedPane(page: import('@playwright/test').Page, name: 'Source' | 'Preview') {
  const tab = page.getByRole('tab', { name });
  if (await tab.isVisible()) await tab.click();
}

async function ensureLibraryOpen(page: import('@playwright/test').Page) {
  const createButton = page.getByRole('button', { name: 'New diagram' });
  if (await createButton.isVisible()) return;
  await page.getByRole('button', { name: 'Open local library' }).click();
  await expect(createButton).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.getByLabel('Mermaid diagram source')).toBeVisible();
});

test('keeps native typing stable until advanced editing is explicitly enabled', async ({
  page,
}) => {
  const source = page.getByLabel('Mermaid diagram source');
  await expect(page.locator('.cm-content')).toHaveCount(0);

  await source.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  });
  await page.keyboard.type('XY');
  await expect(source).toHaveValue(/XY$/u);
  await expect(page.locator('.cm-content')).toHaveCount(0);

  const startupScripts = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /(?:CodeEditor|codemirror)/iu.test(name)),
  );
  expect(startupScripts).toEqual([]);

  await page.getByRole('button', { name: 'Enable advanced editor' }).click();
  await expect(page.locator('.cm-content')).toContainText('XY');
});

test('isolates advanced-editor history when switching local documents', async ({ page }) => {
  const welcomeSource = await page.getByLabel('Mermaid diagram source').inputValue();
  await ensureLibraryOpen(page);
  await page.getByRole('button', { name: 'New diagram' }).click();
  await expect(page.locator('#document-title')).toHaveValue('Untitled diagram');
  await page.locator('#document-title').fill('Second diagram');
  await page.getByLabel('Mermaid diagram source').fill('flowchart LR\n  Second --> Document');
  await expect(page.locator('.save-state')).toContainText(/Saved locally|Temporary/, {
    timeout: 10_000,
  });

  await page.getByRole('button', { name: 'Enable advanced editor' }).click();
  await ensureLibraryOpen(page);
  await page.getByRole('button', { name: /Welcome diagram.*Modified/u }).click();
  await expect(page.locator('.cm-content')).toContainText(
    welcomeSource.split('\n')[0] ?? 'flowchart',
  );
  await expect(page.locator('.save-state')).toContainText(/Saved locally|Temporary/);

  await page.locator('.cm-content').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
  await expect(page.locator('.cm-content')).not.toContainText('Second --> Document');
  await expect(page.locator('.save-state')).toContainText(/Saved locally|Temporary/);
});

test('flushes a just-edited draft when leaving the editor', async ({ page }) => {
  await page.locator('#document-title').fill('Immediate navigation save');
  await page.getByLabel('Mermaid diagram source').fill('flowchart LR\n  Leave --> Return');
  await page.goto('/');
  await page.goto('/editor/');

  await expect(page.locator('#document-title')).toHaveValue('Immediate navigation save');
  await expect(page.getByLabel('Mermaid diagram source')).toHaveValue(/Leave --> Return/u);
});

test('opens templates as new documents without replacing current work', async ({ page }) => {
  await page.locator('#document-title').fill('Keep this diagram');
  await page.getByLabel('Mermaid diagram source').fill('flowchart LR\n  Keep --> Original');
  await page.getByRole('button', { name: 'Choose a Mermaid template' }).click();
  await page
    .getByRole('button', { name: /Sequence diagram/u })
    .first()
    .click();

  await expect(page.locator('#document-title')).toHaveValue('Sequence diagram');
  await expect(page.locator('.library-item')).toHaveCount(2);
  await ensureLibraryOpen(page);
  await page.getByRole('button', { name: /Keep this diagram.*Modified/u }).click();
  await expect(page.getByLabel('Mermaid diagram source')).toHaveValue(/Keep --> Original/u);
});

test('reveals the editor skip link when it receives keyboard focus', async ({ page }) => {
  await page.locator('body').focus();
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to diagram editor' });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
});

test('creates, autosaves, reloads, and preserves the last valid preview', async ({ page }) => {
  await page.locator('#document-title').fill('Local sequence');
  await replaceCodeMirrorSource(page, replacementSource);
  await expect(page.locator('.save-state')).toContainText(/Saved locally|Temporary/, {
    timeout: 10_000,
  });
  await showTabbedPane(page, 'Preview');
  await expect(page.locator('.render-state')).toContainText(/preview ready/i, { timeout: 30_000 });

  await showTabbedPane(page, 'Source');
  await replaceCodeMirrorSource(page, 'not-a-real-diagram');
  await showTabbedPane(page, 'Preview');
  await expect(page.locator('.render-state')).toHaveAttribute('data-state', 'error', {
    timeout: 30_000,
  });
  await expect(page.locator('.preview-pane .pane-status--error')).toContainText(
    'last valid preview',
  );
  await expect(page.locator('.save-state')).toContainText(/Saved locally|Temporary/, {
    timeout: 10_000,
  });

  await page.reload();
  await expect(page.locator('#document-title')).toHaveValue('Local sequence');
  await expect(page.getByLabel('Mermaid diagram source')).toHaveValue('not-a-real-diagram');
});

test('shares an immutable fragment and opens it in a fresh context', async ({ page, browser }) => {
  await page.locator('#document-title').fill('Shared locally');
  await replaceCodeMirrorSource(page, replacementSource);
  await expect(page.locator('.save-state')).toContainText(/Saved locally|Temporary/, {
    timeout: 10_000,
  });

  await page.getByRole('button', { name: 'Share snapshot' }).click();
  const shareUrl = await page.getByLabel('Share URL').inputValue();
  expect(shareUrl).toContain('/editor/#v1:');

  const context = await browser.newContext();
  const recipient = await context.newPage();
  await recipient.goto(shareUrl);
  await expect(recipient.locator('#document-title')).toHaveValue('Shared locally');
  await expect(recipient.getByLabel('Mermaid diagram source')).toHaveValue(/Edit locally/u);
  expect(new URL(recipient.url()).hash).toBe('');
  await context.close();
});

test('imports supported source and downloads source, SVG, and PNG', async ({ page }) => {
  await page.locator('input[type=file]').setInputFiles({
    name: 'imported.mmd',
    mimeType: 'text/plain',
    buffer: Buffer.from('flowchart LR\n  Imported --> Safe'),
  });
  await expect(page.locator('#document-title')).toHaveValue('imported');
  await showTabbedPane(page, 'Preview');
  await expect(page.locator('.render-state')).toContainText(/preview ready/i, { timeout: 30_000 });

  await page.getByRole('button', { name: /Export/ }).click();

  const sourceDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Mermaid source .mmd' }).click();
  expect((await sourceDownload).suggestedFilename()).toBe('imported.mmd');

  const svgDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Sanitized SVG/ }).click();
  expect((await svgDownload).suggestedFilename()).toBe('imported.svg');

  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download PNG at 2×/ }).click();
  expect((await pngDownload).suggestedFilename()).toBe('imported.png');
});

test('never exports a previous valid render for invalid current source', async ({ page }) => {
  await page.getByLabel('Mermaid diagram source').fill('flowchart LR\n  Valid --> Preview');
  await showTabbedPane(page, 'Preview');
  await expect(page.locator('.render-state')).toContainText(/preview ready/i, { timeout: 30_000 });

  await page.getByRole('button', { name: /Export/ }).click();
  await expect(page.getByRole('button', { name: /Sanitized SVG/ })).toBeEnabled();
  const exportDialog = page.getByRole('dialog', { name: 'Export diagram' });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(exportDialog).not.toBeVisible();

  await showTabbedPane(page, 'Source');
  await page.getByLabel('Mermaid diagram source').fill('not-a-real-diagram');
  await showTabbedPane(page, 'Preview');
  await expect(page.locator('.render-state')).toHaveAttribute('data-state', 'error', {
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /Export/ }).click();
  await expect(page.getByRole('button', { name: /Sanitized SVG/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Download PNG/ })).toBeDisabled();
});

test('offers source and preview tabs at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByRole('button', { name: 'Choose a Mermaid template' })).toBeVisible();
  const libraryButton = page.getByRole('button', { name: 'Open local library' });
  await expect(libraryButton).toHaveAttribute('aria-expanded', 'false');
  await libraryButton.click();
  await expect(libraryButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#local-library')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#local-library').locator(':focus')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close library' }).click();
  await expect(libraryButton).toBeFocused();
  await expect(libraryButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('tab', { name: 'Source' })).toBeVisible();
  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.preview-pane')).toBeVisible();
  await expect(page.locator('.source-pane')).toBeHidden();
});
