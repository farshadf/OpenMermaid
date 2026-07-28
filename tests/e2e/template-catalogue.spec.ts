import { expect, test } from '@playwright/test';

test('catalogue remains complete and hides inert controls without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    ...(baseURL === undefined ? {} : { baseURL }),
  });
  const page = await context.newPage();
  try {
    await page.goto('/templates/');
    await expect(page.locator('[data-template-card]')).toHaveCount(37);
    await expect(page.locator('[data-template-controls]')).toBeHidden();
    await expect(page.locator('noscript .callout')).toContainText(
      'The complete 37-template catalogue',
    );
  } finally {
    await context.close();
  }
});

test('catalogue renders every template with a lazy decorative thumbnail', async ({ page }) => {
  await page.goto('/templates/');

  await expect(page.locator('[data-template-card]')).toHaveCount(37);
  await expect(page.locator('[data-template-group]')).toHaveCount(5);
  await expect(page.locator('[data-template-card] h3')).toHaveCount(37);
  await expect(page.locator('[data-template-card] img[alt=""][loading="lazy"]')).toHaveCount(37);
  await expect(page.locator('[data-template-card] img').first()).toHaveAttribute(
    'src',
    /\/examples\/templates\/[^/]+\.svg$/u,
  );
  for (const slug of ['state-starter', 'class-starter', 'er-starter']) {
    const card = page.locator(`[data-slug="${slug}"]`);
    const [thumbnailBox, imageBox] = await Promise.all([
      card.locator('.template-card__thumbnail').boundingBox(),
      card.locator('.template-card__thumbnail img').boundingBox(),
    ]);
    expect(thumbnailBox).not.toBeNull();
    expect(imageBox).not.toBeNull();
    expect(imageBox?.height).toBeLessThanOrEqual((thumbnailBox?.height ?? 0) + 1);
    expect(imageBox?.width).toBeLessThanOrEqual((thumbnailBox?.width ?? 0) + 1);
  }
  await expect(page.getByRole('option', { name: 'Most reported' })).toHaveCount(0);
});

test('catalogue search, facets, sorting, grouping, URL state, and clear action compose', async ({
  page,
}) => {
  await page.goto(
    '/templates/?q=api+retry&category=software-systems&maturity=stable&kind=recipe&sort=name&group=kind',
  );

  await expect(page.locator('[data-template-card]')).toHaveCount(1);
  await expect(page.locator('[data-template-card]')).toHaveAttribute(
    'data-slug',
    'api-retry-recipe',
  );
  await expect(page.getByRole('heading', { level: 2, name: 'Task recipes' })).toBeVisible();
  await expect(page.locator('#template-results')).toHaveText('1 of 37 templates match.');

  await page.getByLabel('Search the catalogue').fill('retry database');
  await expect(page.locator('[data-template-card]')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { level: 2, name: 'No matching templates' }),
  ).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('retry database');

  await page.getByRole('button', { name: 'Clear all filters' }).click();
  await expect(page.locator('[data-template-card]')).toHaveCount(37);
  await expect(page.locator('[data-template-group]')).toHaveCount(5);
  expect(new URL(page.url()).search).toBe('');

  await page.getByLabel('Software & systems').check();
  await page.getByLabel('Sort by').selectOption('name');
  await page.getByLabel('Group by').selectOption('none');
  const names = await page
    .locator('[data-template-card]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-name')));
  expect(names).toEqual(
    [...names].sort((left, right) => String(left).localeCompare(String(right))),
  );
  await expect(page.getByRole('heading', { level: 2, name: 'All templates' })).toBeVisible();
  expect(new URL(page.url()).searchParams.getAll('category')).toEqual(['software-systems']);
  expect(new URL(page.url()).searchParams.get('group')).toBe('none');
});

test('catalogue search recognizes canonical and legacy Mermaid directives', async ({ page }) => {
  await page.goto('/templates/');

  for (const [query, slug] of [
    ['sequenceDiagram', 'sequence-starter'],
    ['flowchart-elk', 'flowchart-starter'],
    ['stateDiagram-v2', 'state-starter'],
    ['requirementDiagram', 'requirement-starter'],
    ['C4Context', 'c4-starter'],
    ['sankey-beta', 'sankey-starter'],
  ] as const) {
    await page.getByLabel('Search the catalogue').fill(query);
    await expect(page.locator(`[data-slug="${slug}"]`)).toBeVisible();
  }
});

test('catalogue restores URL-backed state on popstate', async ({ page }) => {
  await page.goto('/templates/');
  await page.evaluate(() => {
    window.history.pushState(
      null,
      '',
      '/templates/?category=data-comparison&maturity=beta&group=maturity',
    );
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(page.getByLabel('Data & comparison')).toBeChecked();
  await expect(page.getByLabel('Beta')).toBeChecked();
  await expect(page.getByLabel('Group by')).toHaveValue('maturity');
  await expect(page.getByRole('heading', { level: 2, name: 'Beta' })).toBeVisible();
  await expect(page.locator('[data-template-card]')).toHaveCount(3);
});

test('fresh aggregate lower bounds unlock usage labels and Most reported sorting', async ({
  page,
}) => {
  await page.goto('/templates/');
  const generatedAt = new Date().toISOString();
  await page.evaluate(
    ({ eventName, snapshot }) => {
      window.dispatchEvent(new CustomEvent(eventName, { detail: snapshot }));
    },
    {
      eventName: 'openmermaid:template-usage-counts',
      snapshot: {
        generatedAt,
        counts: {
          'flowchart-starter': 120,
          'sequence-starter': 80,
        },
      },
    },
  );

  await expect(page.getByRole('option', { name: 'Most reported' })).toHaveCount(1);
  await expect(page.locator('[data-slug="flowchart-starter"] [data-template-usage]')).toHaveText(
    '120+ reported uses',
  );
  await expect(page.locator('[data-template-usage]:visible')).toHaveCount(2);
  await page.getByLabel('Sort by').selectOption('popular');
  await page.getByLabel('Group by').selectOption('none');
  await expect(page.locator('[data-template-card]').first()).toHaveAttribute(
    'data-slug',
    'flowchart-starter',
  );
  await expect(page.locator('[data-template-usage-note]')).toContainText(
    'rounded lower bounds from opted-in reports',
  );
});

test('a requested popularity sort activates only after a fresh snapshot arrives', async ({
  page,
}) => {
  await page.goto('/templates/?sort=popular');
  await expect(page.getByLabel('Sort by')).toHaveValue('recommended');
  await expect.poll(() => new URL(page.url()).searchParams.has('sort')).toBe(false);

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('openmermaid:template-usage-counts', {
        detail: {
          generatedAt: new Date().toISOString(),
          counts: {
            'flowchart-starter': 20,
            'sequence-starter': 100,
          },
        },
      }),
    );
  });

  await expect(page.getByLabel('Sort by')).toHaveValue('popular');
  await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('popular');
  await page.getByLabel('Group by').selectOption('none');
  await expect(page.locator('[data-template-card]').first()).toHaveAttribute(
    'data-slug',
    'sequence-starter',
  );
});

test('an explicit sort choice cancels deferred popularity activation', async ({ page }) => {
  await page.goto('/templates/?sort=popular');
  await expect(page.getByLabel('Sort by')).toHaveValue('recommended');
  await page.getByLabel('Sort by').selectOption('name');

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('openmermaid:template-usage-counts', {
        detail: {
          generatedAt: new Date().toISOString(),
          counts: {
            'flowchart-starter': 20,
            'sequence-starter': 100,
          },
        },
      }),
    );
  });

  await expect(page.getByLabel('Sort by')).toHaveValue('name');
  await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('name');
  await page.getByLabel('Group by').selectOption('none');
  await expect(page.locator('[data-template-card]').first()).toHaveAttribute(
    'data-slug',
    'api-retry-recipe',
  );
});

test('stale or below-threshold aggregate data does not expose popularity', async ({ page }) => {
  await page.goto('/templates/?sort=popular');
  await expect(page.getByLabel('Sort by')).toHaveValue('recommended');
  await expect.poll(() => new URL(page.url()).searchParams.has('sort')).toBe(false);
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('openmermaid:template-usage-counts', {
        detail: {
          generatedAt: '2020-01-01T00:00:00.000Z',
          counts: { 'flowchart-starter': 19 },
        },
      }),
    );
  });

  await expect(page.getByRole('option', { name: 'Most reported' })).toHaveCount(0);
  await expect(page.locator('[data-template-usage]:visible')).toHaveCount(0);
});
