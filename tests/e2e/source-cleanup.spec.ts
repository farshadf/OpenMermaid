import { expect, test, type Locator, type Page } from '@playwright/test';

const fencedSource = '\uFEFF```mermaid\r\nflowchart LR\r\n  Pasted --> Clean\r\n```';
const simpleFencedSource = '```mermaid\nflowchart LR\n  Pasted --> Clean\n```';
const cleanedSource = 'flowchart LR\n  Pasted --> Clean';
const multiBlockSource =
  '```mermaid\nflowchart LR\n  First --> Block\n```\n\n```mermaid\nflowchart LR\n  Second --> Block\n```';

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor/');
  await expect(page.getByLabel('Mermaid diagram source')).toBeVisible();
}

async function dispatchPaste(target: Locator, text: string): Promise<boolean> {
  return target.evaluate((element, clipboardText) => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', clipboardText);
    // Firefox does not consistently retain synthetic clipboardData passed to
    // the ClipboardEvent constructor. Defining the read-only property makes
    // this deterministic without changing the application event path.
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: clipboard });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, text);
}

async function codeMirrorValue(code: Locator): Promise<string> {
  return (await code.locator('.cm-line').allTextContents()).join('\n');
}

test.beforeEach(async ({ page }) => openEditor(page));

test('cleans only the pasted payload in the native editor and preserves the insertion point', async ({
  page,
}) => {
  const source = page.getByLabel('Mermaid diagram source');
  const original =
    '%% ```mermaid outside the selection\nflowchart LR\n  Before --> REPLACE_ME\n  After --> End';
  const pastedFragment = '```mermaid\nMiddleNode\n```';
  const selectionStart = original.indexOf('REPLACE_ME');
  const expected = original.replace('REPLACE_ME', 'MiddleNode');
  await source.fill(original);
  await source.evaluate((element: HTMLTextAreaElement, start: number) => {
    element.focus();
    element.setSelectionRange(start, start + 'REPLACE_ME'.length);
  }, selectionStart);

  expect(await dispatchPaste(source, pastedFragment)).toBe(true);

  await expect(source).toHaveValue(expected);
  await expect(page.getByText(/Cleaned up pasted source/u)).toBeVisible();
  await expect
    .poll(() =>
      source.evaluate((element: HTMLTextAreaElement) => ({
        start: element.selectionStart,
        end: element.selectionEnd,
      })),
    )
    .toEqual({
      start: selectionStart + 'MiddleNode'.length,
      end: selectionStart + 'MiddleNode'.length,
    });
});

test('cleans pasted payloads in CodeMirror as one undoable edit', async ({ page }, testInfo) => {
  const original = '';
  await page.getByLabel('Mermaid diagram source').fill(original);
  await page.getByRole('button', { name: 'Enable advanced editor' }).click();
  const code = page.locator('.cm-content');
  await expect(code).toBeVisible();
  await code.click();

  expect(await dispatchPaste(code, fencedSource)).toBe(true);

  await expect.poll(() => codeMirrorValue(code)).toBe(cleanedSource);
  await expect(page.getByText(/Cleaned up pasted source/u)).toBeVisible();
  if (testInfo.project.name === 'mobile-webkit') return;
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => codeMirrorValue(code)).toBe(original);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect.poll(() => codeMirrorValue(code)).toBe(cleanedSource);
});

test('cleans existing source only after the explicit action and reports an already-clean result', async ({
  page,
}) => {
  const source = page.getByLabel('Mermaid diagram source');
  await source.fill(simpleFencedSource);
  await expect(source).toHaveValue(simpleFencedSource);

  await page.getByRole('button', { name: 'Clean up source' }).click();
  await expect(source).toHaveValue(cleanedSource);
  await expect(page.getByText(/Cleaned up source/u)).toBeVisible();

  await page.getByRole('button', { name: 'Clean up source' }).click();
  await expect(page.getByText('Source already looks clean.')).toBeVisible();
  await expect(source).toHaveValue(cleanedSource);

  await source.fill(multiBlockSource);
  await page.getByRole('button', { name: 'Clean up source' }).click();
  await expect(source).toHaveValue(multiBlockSource);
  await expect(page.getByText(/multiple Mermaid blocks/u)).toBeVisible();
});

test('makes advanced-editor cleanup one exact undoable and redoable edit', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-webkit',
    'Mobile WebKit emulation does not model a hardware undo shortcut.',
  );
  await page.getByLabel('Mermaid diagram source').fill(simpleFencedSource);
  await page.getByRole('button', { name: 'Enable advanced editor' }).click();
  const code = page.locator('.cm-content');
  await expect.poll(() => codeMirrorValue(code)).toBe(simpleFencedSource);

  await page.getByRole('button', { name: 'Clean up source' }).click();
  await expect.poll(() => codeMirrorValue(code)).toBe(cleanedSource);
  await expect(page.getByText(/Cleaned up source/u)).toBeVisible();

  await code.click();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => codeMirrorValue(code)).toBe(simpleFencedSource);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect.poll(() => codeMirrorValue(code)).toBe(cleanedSource);
});

test('reports warning-only passthrough and rejects cleanup that would exceed source limits', async ({
  page,
}) => {
  const source = page.getByLabel('Mermaid diagram source');
  await source.fill('flowchart LR\n  Existing --> Diagram');
  await source.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  });
  expect(await dispatchPaste(source, 'flowchart LR\n  A → B')).toBe(false);
  await expect(page.getByText(/Cleanup left the pasted source unchanged/u)).toBeVisible();

  const nearLimit = 'x'.repeat(49_999);
  await source.fill(nearLimit);
  await source.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  });
  expect(await dispatchPaste(source, '```mermaid\nAB\n```')).toBe(true);
  await expect(source).toHaveValue(nearLimit);
  await expect(page.getByText(/limited to 50,000 characters/u)).toBeVisible();
  await expect(page.getByText(/Cleaned up pasted source/u)).toHaveCount(0);
});

test('reports cleanup performed while importing generated wrapper text', async ({ page }) => {
  await page.locator('input[type=file]').setInputFiles({
    name: 'generated.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(fencedSource),
  });

  await expect(page.locator('#document-title')).toHaveValue('generated');
  await expect(page.getByLabel('Mermaid diagram source')).toHaveValue(cleanedSource);
  await expect(page.getByText(/Imported generated\.txt and cleaned up/u)).toBeVisible();
});
