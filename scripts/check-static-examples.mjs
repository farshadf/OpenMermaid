import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { guides } from '../src/data/guides.ts';
import { diagramTemplates } from '../src/data/templates.ts';

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

for (const example of examples) {
  const contents = await readFile(resolve(workspace, example.relativePath), 'utf8');
  const expectedHeader = `<!-- OpenMermaid source-sha256:${sourceDigest(example.source)} mermaid:11.16.0 -->`;
  if (!contents.startsWith(expectedHeader)) {
    throw new Error(`${example.relativePath} is stale; run pnpm examples:generate.`);
  }
  if (!/<svg\b/iu.test(contents) || !/<\/svg>/iu.test(contents)) {
    throw new Error(`${example.relativePath} is not a complete SVG example.`);
  }
  if (
    /<(?:script|iframe|object|embed|image|foreignObject)\b|\son[a-z]+\s*=|(?:href|src)\s*=\s*["']https?:|url\([^)]*https?:|@import/iu.test(
      contents,
    )
  ) {
    throw new Error(`${example.relativePath} contains executable or external-resource markup.`);
  }
}

console.log(`Static Mermaid examples are current (${String(examples.length)} files).`);
