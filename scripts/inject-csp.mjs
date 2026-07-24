import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dist = new URL('../dist/', import.meta.url);

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(resolved)));
    else if (entry.name.endsWith('.html')) files.push(resolved);
  }
  return files;
}

function scriptHashes(html) {
  const hashes = new Set();
  const inlineScript = /<script\b([^>]*)>([\s\S]*?)<\/script>/giu;
  for (const match of html.matchAll(inlineScript)) {
    const attributes = match[1] ?? '';
    const contents = match[2] ?? '';
    if (/\bsrc\s*=/iu.test(attributes) || contents.length === 0) continue;
    const digest = createHash('sha256').update(contents, 'utf8').digest('base64');
    hashes.add(`'sha256-${digest}'`);
  }
  return [...hashes];
}

function policyFor(html, relative) {
  const hashes = scriptHashes(html);
  if (relative === 'renderer/index.html') {
    return [
      "default-src 'none'",
      `script-src 'strict-dynamic' ${hashes.join(' ')}`.trim(),
      "script-src-attr 'none'",
      "style-src 'unsafe-inline'",
      "style-src-elem 'unsafe-inline'",
      "style-src-attr 'unsafe-inline'",
      'img-src data: blob:',
      "font-src 'none'",
      "connect-src 'none'",
      "frame-src 'none'",
      "worker-src 'none'",
      "media-src 'none'",
      "object-src 'none'",
      "manifest-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
  }
  return [
    "default-src 'none'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'none'",
    "connect-src 'none'",
    "frame-src 'self'",
    "worker-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "manifest-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

let updated = 0;
for (const file of await htmlFiles(dist.pathname)) {
  let html = await readFile(file, 'utf8');
  if (/http-equiv=["']Content-Security-Policy["']/iu.test(html)) continue;
  const relative = path.relative(dist.pathname, file);
  const headEnd = html.indexOf('</head>');
  if (headEnd < 0) throw new Error(`${relative} has no closing head tag.`);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policyFor(html, relative)}">`;
  html = `${html.slice(0, headEnd)}${meta}${html.slice(headEnd)}`;
  await writeFile(file, html, 'utf8');
  updated += 1;
}

console.log(`Injected build-derived CSP into ${String(updated)} HTML files.`);
