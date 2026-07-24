import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { chromium } from '@playwright/test';

import { guides } from '../src/data/guides.ts';
import { diagramTemplates } from '../src/data/templates.ts';

const host = '127.0.0.1';
const port = 4323;
const origin = `http://${host}:${String(port)}`;
const workspace = resolve(import.meta.dirname, '..');

const examples = [
  ...diagramTemplates.map((template) => ({
    relativePath: `public/examples/templates/${template.slug}.svg`,
    source: template.source,
  })),
  ...guides.map((guide) => ({
    relativePath: `public/examples/guides/${guide.slug}.svg`,
    source: guide.source,
  })),
];

function sourceDigest(source) {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/editor/`);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error('The local Astro preview did not become ready.');
}

function startPreview() {
  const child = spawn(
    'pnpm',
    ['exec', 'astro', 'preview', '--host', host, '--port', String(port)],
    {
      cwd: workspace,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  return { child, getOutput: () => output };
}

async function main() {
  const preview = startPreview();
  let browser;

  try {
    await waitForServer();
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    });
    const page = await browser.newPage();
    await page.goto(`${origin}/editor/`);
    const sourceInput = page.getByLabel('Mermaid diagram source');
    await sourceInput.waitFor({ state: 'visible' });

    let rendererActive = false;
    for (const example of examples) {
      await sourceInput.fill(example.source);
      if (!rendererActive) {
        const startButton = page.getByRole('button', { name: 'Render preview' });
        if (await startButton.isVisible()) await startButton.click();
        rendererActive = true;
      } else {
        await page.waitForFunction(
          () => document.querySelector('.render-state')?.getAttribute('data-state') !== 'ready',
          undefined,
          { timeout: 10_000 },
        );
      }

      await page.locator('.render-state').waitFor({ state: 'visible' });
      await page.waitForFunction(
        () => document.querySelector('.render-state')?.getAttribute('data-state') === 'ready',
        undefined,
        { timeout: 30_000 },
      );
      const frame = page.frameLocator('.preview-frame');
      const svg = await frame
        .locator('[data-renderer-scene] > svg')
        .evaluate((element) => element.outerHTML);
      if (
        /<(?:script|iframe|object|embed|image|foreignObject)\b|\son[a-z]+\s*=|(?:href|src)\s*=\s*["']https?:|url\([^)]*https?:|@import/iu.test(
          svg,
        )
      ) {
        throw new Error(
          `Generated example ${example.relativePath} did not pass the resource check.`,
        );
      }

      const outputPath = resolve(workspace, example.relativePath);
      await mkdir(dirname(outputPath), { recursive: true });
      const header = `<!-- OpenMermaid source-sha256:${sourceDigest(example.source)} mermaid:11.16.0 -->\n`;
      await writeFile(outputPath, `${header}${svg}\n`, 'utf8');
    }
  } catch (error) {
    const previewOutput = preview.getOutput().trim();
    if (previewOutput) console.error(previewOutput);
    throw error;
  } finally {
    await browser?.close();
    preview.child.kill('SIGTERM');
  }

  console.log(`Generated ${String(examples.length)} source-faithful static Mermaid examples.`);
}

await main();
