import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const assets = new URL('_assets/', dist);
const errors = [];

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesRecursively(resolved)));
    else files.push(resolved);
  }
  return files;
}

async function sizeReport(files) {
  let raw = 0;
  let gzip = 0;
  for (const file of files) {
    const contents = await readFile(file);
    raw += contents.byteLength;
    gzip += gzipSync(contents, { level: 9 }).byteLength;
  }
  return { raw, gzip };
}

function enforce(label, report, limits) {
  if (report.raw > limits.raw) {
    errors.push(
      `${label} raw size ${report.raw.toLocaleString()} exceeds ${limits.raw.toLocaleString()} bytes`,
    );
  }
  if (report.gzip > limits.gzip) {
    errors.push(
      `${label} gzip size ${report.gzip.toLocaleString()} exceeds ${limits.gzip.toLocaleString()} bytes`,
    );
  }
  console.log(
    `${label}: ${report.raw.toLocaleString()} raw / ${report.gzip.toLocaleString()} gzip bytes`,
  );
}

let assetFiles = [];
try {
  assetFiles = await filesRecursively(assets.pathname);
} catch {
  errors.push('Built asset directory is unavailable; run the production build first.');
}

const applicationJavaScript = assetFiles.filter((file) => file.endsWith('.js'));
const applicationCss = assetFiles.filter((file) => file.endsWith('.css'));
enforce('Editor application JavaScript', await sizeReport(applicationJavaScript), {
  raw: 1_200_000,
  gzip: 360_000,
});
enforce('Application CSS', await sizeReport(applicationCss), { raw: 180_000, gzip: 35_000 });

const localVitalsRuntime = assetFiles.filter((file) =>
  /\/(?:VitalsBootstrap|measure|web-vitals|validation|preload-helper)\.[^/]+\.js$/u.test(file),
);
if (localVitalsRuntime.length === 0) {
  errors.push('Local Web Vitals runtime chunks are unavailable.');
} else {
  enforce('Deferred local Web Vitals runtime', await sizeReport(localVitalsRuntime), {
    raw: 25_000,
    gzip: 8_000,
  });
}

const templateCatalogueRuntime = assetFiles.filter((file) =>
  /\/template-catalogue\.[^/]+\.js$/u.test(file),
);
if (templateCatalogueRuntime.length !== 1) {
  errors.push('Expected exactly one page-only template catalogue runtime chunk.');
} else {
  enforce('Template catalogue interaction', await sizeReport(templateCatalogueRuntime), {
    raw: 30_000,
    gzip: 10_000,
  });
}

const rendererPath = new URL('renderer/runtime.js', dist);
try {
  await stat(rendererPath);
  enforce('Isolated full Mermaid renderer', await sizeReport([rendererPath.pathname]), {
    raw: 4_000_000,
    gzip: 1_100_000,
  });
} catch {
  errors.push('Missing isolated renderer runtime.');
}

if (errors.length > 0) {
  console.error(`Bundle budget checks failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('Bundle budgets passed.');
