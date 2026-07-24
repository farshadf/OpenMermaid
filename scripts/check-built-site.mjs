import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const requiredFiles = [
  'index.html',
  'editor/index.html',
  'renderer/index.html',
  'templates/index.html',
  'guides/index.html',
  'about/index.html',
  'privacy/index.html',
  'security/index.html',
  'performance/index.html',
  '404.html',
  'robots.txt',
  'llms.txt',
  'og-default.png',
  'sitemap-index.xml',
];
const errors = [];

for (const relative of requiredFiles) {
  try {
    await access(new URL(relative, dist));
  } catch {
    errors.push(`Missing built file: dist/${relative}`);
  }
}

try {
  const robots = await readFile(new URL('robots.txt', dist), 'utf8');
  const directives = robots
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  for (const expected of ['User-agent: *', 'Allow: /', 'Disallow: /renderer/']) {
    if (!directives.includes(expected)) errors.push(`robots.txt: missing ${expected}`);
  }
  for (const directive of directives) {
    if (!/^(?:User-agent|Allow|Disallow|Sitemap):\s*\S.*$/iu.test(directive)) {
      errors.push(`robots.txt: invalid directive ${directive}`);
    }
  }
} catch {
  // The required-file check above reports the missing artifact.
}

try {
  const png = await readFile(new URL('og-default.png', dist));
  const signature = png.subarray(0, 8).toString('hex');
  const width = png.length >= 24 ? png.readUInt32BE(16) : 0;
  const height = png.length >= 24 ? png.readUInt32BE(20) : 0;
  if (signature !== '89504e470d0a1a0a' || width !== 1200 || height !== 630) {
    errors.push('og-default.png: expected a valid 1200x630 PNG social image');
  }
} catch {
  // The required-file check above reports the missing artifact.
}

try {
  const sitemapFiles = (await readdir(dist))
    .filter((file) => /^sitemap-\d+\.xml$/u.test(file))
    .sort();
  if (sitemapFiles.length === 0) {
    errors.push('Sitemap index has no generated URL sitemap.');
  } else {
    const sitemap = (
      await Promise.all(sitemapFiles.map((file) => readFile(new URL(file, dist), 'utf8')))
    ).join('\n');
    if (!/<loc>[^<]+\/editor\/<\/loc>/u.test(sitemap)) {
      errors.push('Generated sitemap is missing the standalone editor route.');
    }
    if (/<loc>[^<]+\/renderer\/<\/loc>/u.test(sitemap)) {
      errors.push('Generated sitemap must not expose the internal renderer route.');
    }
  }
} catch {
  errors.push('Generated URL sitemap could not be inspected.');
}

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

let pages = [];
try {
  pages = await htmlFiles(dist.pathname);
} catch {
  errors.push('dist/ is unavailable; run the production build first.');
}

const interactiveRoutes = new Set([
  'editor/index.html',
  'performance/index.html',
  'renderer/index.html',
]);
const checkedInternalTargets = new Set();

function routeUrl(relative) {
  if (relative === 'index.html') return 'https://built.openmermaid.test/';
  if (relative.endsWith('/index.html')) {
    return `https://built.openmermaid.test/${relative.slice(0, -'index.html'.length)}`;
  }
  return `https://built.openmermaid.test/${relative}`;
}

async function checkInternalTarget(value, relative) {
  if (
    value.length === 0 ||
    value.startsWith('#') ||
    /^(?:data|blob|mailto|tel|javascript):/iu.test(value)
  ) {
    return;
  }

  let resolved;
  try {
    resolved = new URL(value, routeUrl(relative));
  } catch {
    errors.push(`${relative}: invalid local URL ${value}`);
    return;
  }
  if (resolved.origin !== 'https://built.openmermaid.test') return;

  const pathname = decodeURIComponent(resolved.pathname);
  const target = pathname.endsWith('/') ? `${pathname.slice(1)}index.html` : pathname.slice(1);
  const normalized = path.posix.normalize(target);
  if (normalized.startsWith('../') || path.isAbsolute(normalized)) {
    errors.push(`${relative}: local URL escapes dist: ${value}`);
    return;
  }
  if (checkedInternalTargets.has(normalized)) return;
  checkedInternalTargets.add(normalized);
  try {
    await access(path.join(dist.pathname, normalized));
  } catch {
    errors.push(`${relative}: broken internal resource ${value}`);
  }
}

for (const file of pages) {
  const relative = path.relative(dist.pathname, file);
  const html = await readFile(file, 'utf8');
  if (
    !html.includes('<link rel="canonical"') &&
    relative !== 'renderer/index.html' &&
    relative !== '404.html'
  ) {
    errors.push(`${relative}: missing canonical link`);
  }
  if (!html.includes('<meta name="description"') && relative !== 'renderer/index.html') {
    errors.push(`${relative}: missing description metadata`);
  }
  if (relative !== 'renderer/index.html' && relative !== '404.html') {
    const canonicals = [...html.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*>/giu)];
    if (canonicals.length !== 1) {
      errors.push(`${relative}: expected exactly one canonical link`);
    } else {
      const href = /href=["']([^"']+)["']/iu.exec(canonicals[0][0])?.[1];
      if (href === undefined || !href.startsWith('https://') || new URL(href).hash.length > 0) {
        errors.push(`${relative}: canonical must be an absolute HTTPS URL without a fragment`);
      }
    }
  }

  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/giu)) {
    await checkInternalTarget(match[1], relative);
  }

  for (const block of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu,
  )) {
    try {
      JSON.parse(block[1]);
    } catch {
      errors.push(`${relative}: contains invalid JSON-LD`);
    }
  }
  const csp =
    /<meta(?=[^>]*http-equiv=["']content-security-policy["'])(?=[^>]*content="([^"]+)")[^>]*>/iu.exec(
      html,
    )?.[1];
  if (csp === undefined) {
    errors.push(`${relative}: missing build-derived Content Security Policy`);
  } else if (/script-src[^;]*'unsafe-inline'/iu.test(csp)) {
    errors.push(`${relative}: script-src must not allow arbitrary inline scripts`);
  }
  if (!interactiveRoutes.has(relative)) {
    const scriptAssets = [...html.matchAll(/(?:src|href)="([^"]+\.js(?:\?[^"]*)?)"/g)].map(
      (match) => match[1],
    );
    const unexpectedScripts = scriptAssets.filter(
      (asset) =>
        !/^\/_assets\/VitalsBootstrap\.[^/]+\.js$/u.test(asset) &&
        !(relative === 'templates/index.html' && asset === '/scripts/template-search.js'),
    );
    if (unexpectedScripts.length > 0) {
      errors.push(
        `${relative}: static public page unexpectedly references ${unexpectedScripts.join(', ')}`,
      );
    }
  }
  const scriptAssets = [...html.matchAll(/(?:src|href)="([^"]+\.js(?:\?[^"]*)?)"/g)].map(
    (match) => match[1],
  );
  for (const asset of scriptAssets) {
    const normalized = asset.toLowerCase();
    if (
      relative !== 'renderer/index.html' &&
      (normalized.includes('mermaid') || normalized.includes('codemirror'))
    ) {
      errors.push(`${relative}: unexpectedly references editor dependency ${asset}`);
    }
  }
}

try {
  const home = await readFile(new URL('index.html', dist), 'utf8');
  for (const [label, pattern] of [
    ['PNG Open Graph image', /property="og:image" content="[^"]+\/og-default\.png"/u],
    ['Open Graph image type', /property="og:image:type" content="image\/png"/u],
    ['Open Graph image width', /property="og:image:width" content="1200"/u],
    ['Open Graph image height', /property="og:image:height" content="630"/u],
    ['PNG Twitter image', /name="twitter:image" content="[^"]+\/og-default\.png"/u],
  ]) {
    if (!pattern.test(home)) errors.push(`Homepage metadata is missing ${label}.`);
  }
} catch {
  // The required-file check above reports the missing artifact.
}

try {
  const editor = await readFile(new URL('editor/index.html', dist), 'utf8');
  for (const [label, pattern] of [
    ['Open Graph title', /property="og:title" content="Mermaid editor \| Open Mermaid"/u],
    ['PNG Open Graph image', /property="og:image" content="[^"]+\/og-default\.png"/u],
    ['Twitter card', /name="twitter:card" content="summary_large_image"/u],
  ]) {
    if (!pattern.test(editor)) errors.push(`Editor metadata is missing ${label}.`);
  }
  const blocks = [
    ...editor.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu),
  ];
  const structuredData = blocks.flatMap((match) => {
    const value = JSON.parse(match[1]);
    return Array.isArray(value) ? value : [value];
  });
  if (!structuredData.some((item) => item?.['@type'] === 'WebApplication')) {
    errors.push('Editor structured data is missing WebApplication.');
  }
} catch (error) {
  errors.push(`Editor social and structured metadata could not be inspected: ${String(error)}`);
}

try {
  const template = await readFile(new URL('templates/flowchart-starter/index.html', dist), 'utf8');
  const blocks = [
    ...template.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu),
  ];
  const structuredData = blocks.flatMap((match) => {
    const value = JSON.parse(match[1]);
    return Array.isArray(value) ? value : [value];
  });
  const article = structuredData.find((item) => item?.['@type'] === 'TechArticle');
  for (const property of [
    'mainEntityOfPage',
    'image',
    'datePublished',
    'dateModified',
    'author',
    'publisher',
    'hasPart',
  ]) {
    if (article?.[property] === undefined) {
      errors.push(`Template TechArticle structured data is missing ${property}.`);
    }
  }
} catch (error) {
  errors.push(`Template TechArticle structured data could not be inspected: ${String(error)}`);
}

if (errors.length > 0) {
  console.error(`Built-site checks failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(`Built-site metadata and route checks passed for ${pages.length} HTML files.`);
