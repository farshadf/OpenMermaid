import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

const RECOVERY_JOURNAL_KEY = 'openmermaid:pending-draft:v1';

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor/');
  await expect(page.getByLabel('Mermaid diagram source')).toBeVisible();
  await expect(page.locator('.save-state')).toHaveAttribute('data-state', 'saved');
}

async function ensureLibraryOpen(page: Page): Promise<void> {
  const createButton = page.getByRole('button', { name: 'New diagram' });
  if (await createButton.isVisible()) return;
  await page.getByRole('button', { name: 'Open local library' }).click();
  await expect(createButton).toBeVisible();
}

function documentItem(page: Page, title: string): Locator {
  return page.locator('.library-item').filter({
    has: page.locator('.library-item__title').getByText(title, { exact: true }),
  });
}

async function waitForAutosave(page: Page): Promise<void> {
  await expect(page.locator('.save-state')).toHaveAttribute('data-state', /pending|saving/u);
  await expect(page.locator('.save-state')).toHaveAttribute('data-state', 'saved', {
    timeout: 10_000,
  });
}

async function updateActiveDocument(
  page: Page,
  options: { readonly title: string; readonly source: string },
): Promise<void> {
  await page.locator('#document-title').fill(options.title);
  await page.getByLabel('Mermaid diagram source').fill(options.source);
  await waitForAutosave(page);
}

async function openItemActions(page: Page, title: string): Promise<Locator> {
  await ensureLibraryOpen(page);
  const item = documentItem(page, title);
  await expect(item).toHaveCount(1);
  await item.locator(`summary[aria-label="Actions for ${title}"]`).click();
  return item;
}

async function forceConflict(
  context: BrowserContext,
  primary: Page,
): Promise<{
  readonly secondary: Page;
  readonly savedSource: string;
  readonly localSource: string;
}> {
  await updateActiveDocument(primary, {
    title: 'Shared conflict document',
    source: 'flowchart LR\n  Baseline --> Shared',
  });

  const secondary = await context.newPage();
  await openEditor(secondary);
  await expect(secondary.locator('#document-title')).toHaveValue('Shared conflict document');

  const localSource = 'flowchart LR\n  Secondary --> LocalPending';
  const savedSource = 'flowchart LR\n  Primary --> SavedFirst';
  await secondary.getByLabel('Mermaid diagram source').fill(localSource);
  await expect(secondary.locator('.save-state')).toHaveAttribute('data-state', 'pending');

  // Commit and announce a competing revision directly from the first tab. This
  // keeps the ordering deterministic even when WebKit flushes a hidden tab's
  // pending autosave immediately.
  await primary.evaluate(async (source) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('openmermaid', 1);
      request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
      request.onsuccess = () => resolve(request.result);
    });
    const stored = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const transaction = database.transaction('documents', 'readonly');
      const request = transaction.objectStore('documents').getAll();
      request.onerror = () => reject(request.error ?? new Error('Could not read documents.'));
      request.onsuccess = () => {
        const document = (request.result as Record<string, unknown>[]).find(
          ({ title }) => title === 'Shared conflict document',
        );
        if (document === undefined) reject(new Error('Shared document was not stored.'));
        else resolve(document);
      };
    });
    const id = String(stored.id);
    const revision = Number(stored.revision) + 1;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('documents', 'readwrite');
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not write a competing revision.'));
      transaction.oncomplete = () => resolve();
      transaction.objectStore('documents').put({
        ...stored,
        id,
        source,
        revision,
        updatedAt: new Date().toISOString(),
      });
    });
    database.close();

    const channel = new BroadcastChannel('openmermaid-documents');
    channel.postMessage({
      protocol: 'openmermaid-documents-v1',
      senderId: 'playwright-competing-tab',
      kind: 'put',
      id,
      revision,
      timestamp: new Date().toISOString(),
    });
    channel.close();
  }, savedSource);

  await expect(
    secondary.getByRole('dialog', { name: 'Another tab changed this diagram' }),
  ).toBeVisible({ timeout: 10_000 });

  return { secondary, savedSource, localSource };
}

test('manages the complete local-library lifecycle and confirms destructive clearing', async ({
  page,
}) => {
  await openEditor(page);
  await updateActiveDocument(page, {
    title: 'Alpha overview',
    source: 'flowchart LR\n  Alpha --> SEARCHABLE_ALPHA',
  });

  await ensureLibraryOpen(page);
  await page.getByRole('button', { name: 'New diagram' }).click();
  await expect(page.locator('#document-title')).toHaveValue('Untitled diagram');
  await updateActiveDocument(page, {
    title: 'Beta workflow',
    source: 'sequenceDiagram\n  Beta->>Browser: Local workspace',
  });

  const betaActions = await openItemActions(page, 'Beta workflow');
  await betaActions.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.locator('#document-title')).toHaveValue('Beta workflow copy');
  await expect(documentItem(page, 'Beta workflow copy')).toHaveCount(1);

  // updatedAt has millisecond resolution; ensure this edit is observably newer than the copy.
  await page.waitForTimeout(25);
  await ensureLibraryOpen(page);
  await documentItem(page, 'Alpha overview').getByRole('button').first().click();
  await expect(page.locator('#document-title')).toHaveValue('Alpha overview');
  await page
    .getByLabel('Mermaid diagram source')
    .fill('flowchart LR\n  Alpha --> SEARCHABLE_ALPHA\n  Alpha --> RecentlyModified');
  await waitForAutosave(page);

  await expect(page.locator('.library-item__title').first()).toHaveText('Alpha overview');

  await ensureLibraryOpen(page);
  const search = page.getByLabel('Search documents');
  await search.fill('SEARCHABLE_ALPHA');
  await expect(page.locator('.library-item')).toHaveCount(1);
  await expect(documentItem(page, 'Alpha overview')).toHaveCount(1);
  await search.fill('');
  await expect(page.locator('.library-item')).toHaveCount(3);

  const copyActions = await openItemActions(page, 'Beta workflow copy');
  await copyActions.getByRole('button', { name: 'Delete' }).click();
  await expect(documentItem(page, 'Beta workflow copy')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo delete' }).click();
  await expect(documentItem(page, 'Beta workflow copy')).toHaveCount(1);

  await page.getByRole('button', { name: 'Clear local data' }).click();
  const clearDialog = page.getByRole('dialog', { name: 'Clear all local data?' });
  await expect(clearDialog).toBeVisible();
  await expect(clearDialog).toContainText('permanently removes every Open Mermaid diagram');
  await expect(clearDialog).toContainText('local performance history');
  await clearDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(clearDialog).not.toBeVisible();
  await expect(page.locator('.library-item')).toHaveCount(3);

  await page.getByRole('button', { name: 'Clear local data' }).click();
  await clearDialog.getByRole('button', { name: 'Clear local data' }).click();
  await expect(page.locator('.library-item')).toHaveCount(1);
  await expect(documentItem(page, 'Welcome diagram')).toHaveCount(1);
  await expect(
    page.getByText('Local diagrams and performance history were cleared.'),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Mermaid diagram source')).toBeVisible();
  await expect(page.locator('.library-item')).toHaveCount(1);
  await expect(page.locator('#document-title')).toHaveValue('Welcome diagram');
});

test('detects a real multi-tab revision conflict and preserves local edits as a copy', async ({
  context,
  page,
}) => {
  await openEditor(page);
  const { secondary, savedSource, localSource } = await forceConflict(context, page);
  const conflictDialog = secondary.getByRole('dialog', {
    name: 'Another tab changed this diagram',
  });

  await conflictDialog.getByRole('button', { name: 'Keep my changes as a copy' }).click();
  await expect(conflictDialog).not.toBeVisible();
  await expect(secondary.locator('#document-title')).toHaveValue(
    'Shared conflict document conflicted copy',
  );
  await expect(secondary.getByLabel('Mermaid diagram source')).toHaveValue(localSource);
  await expect(documentItem(secondary, 'Shared conflict document')).toHaveCount(1);
  await expect(documentItem(secondary, 'Shared conflict document conflicted copy')).toHaveCount(1);

  await ensureLibraryOpen(secondary);
  await documentItem(secondary, 'Shared conflict document').getByRole('button').first().click();
  await expect(secondary.getByLabel('Mermaid diagram source')).toHaveValue(savedSource);
  await secondary.close();
});

test('uses a clearly marked temporary workspace when IndexedDB is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: {
        open(): never {
          throw new DOMException('IndexedDB was blocked for this test.', 'SecurityError');
        },
      },
    });
  });

  await openEditor(page);
  await expect(
    page.getByText(
      'Browser storage is unavailable. Changes last only until this tab closes; export your work.',
    ),
  ).toBeVisible();
  await expect(page.locator('.save-state')).toContainText('Temporary');

  await page.locator('#document-title').fill('Temporary-only draft');
  await page
    .getByLabel('Mermaid diagram source')
    .fill('flowchart LR\n  Temporary --> StillEditable');
  await waitForAutosave(page);
  await expect(page.locator('.save-state')).toContainText('Temporary');

  await page.reload();
  await expect(page.getByLabel('Mermaid diagram source')).toBeVisible();
  await expect(page.locator('#document-title')).toHaveValue('Welcome diagram');
  await expect(page.locator('.save-state')).toContainText('Temporary');
});

test('restores a valid pending recovery journal into IndexedDB and clears the journal', async ({
  page,
}) => {
  await openEditor(page);

  await page.evaluate(async (journalKey) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('openmermaid', 1);
      request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
      request.onsuccess = () => resolve(request.result);
    });
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = database.transaction('documents', 'readonly');
      const request = transaction.objectStore('documents').getAll();
      request.onerror = () => reject(request.error ?? new Error('Could not read documents.'));
      request.onsuccess = () => resolve(request.result as unknown[]);
    });
    database.close();

    const stored = records[0] as {
      revision: number;
      updatedAt: string;
      [key: string]: unknown;
    };
    const recovered = {
      ...stored,
      title: 'Recovered browser draft',
      source: 'flowchart LR\n  RecoveryJournal --> Restored',
      revision: stored.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(
      journalKey,
      JSON.stringify({ document: recovered, expectedRevision: stored.revision }),
    );
  }, RECOVERY_JOURNAL_KEY);

  await page.reload();
  await expect(page.getByLabel('Mermaid diagram source')).toBeVisible();
  await expect(page.locator('#document-title')).toHaveValue('Recovered browser draft');
  await expect(page.getByLabel('Mermaid diagram source')).toHaveValue(
    'flowchart LR\n  RecoveryJournal --> Restored',
  );
  await expect(
    page.getByText('Recovered edits that had not reached IndexedDB before the page closed.'),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((journalKey) => localStorage.getItem(journalKey), RECOVERY_JOURNAL_KEY),
    )
    .toBeNull();

  await page.reload();
  await expect(page.locator('#document-title')).toHaveValue('Recovered browser draft');
  await expect(page.getByLabel('Mermaid diagram source')).toHaveValue(/RecoveryJournal/u);
});
