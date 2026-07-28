import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const telemetryMode = process.env.PUBLIC_TELEMETRY_MODE ?? 'off';
if (!['off', 'aggregate'].includes(telemetryMode)) {
  console.error('PUBLIC_TELEMETRY_MODE must be either "off" or "aggregate".');
  process.exit(1);
}
const productionDependencies = Object.keys(packageJson.dependencies ?? {});
const forbiddenDependencyPatterns = [
  /^openai$/i,
  /^@openai\//i,
  /^@modelcontextprotocol\//i,
  /chatgpt/i,
  /(?:google-analytics|gtag|posthog|segment|mixpanel|plausible|fathom|amplitude)/i,
  /(?:adsense|adservice|doubleclick|googlesyndication)/i,
];
const forbiddenSourcePatterns = [
  {
    pattern: /from\s+['"](?:openai|@openai\/|@modelcontextprotocol\/)/,
    reason: 'forbidden runtime import',
  },
  {
    pattern: /import\s*\(\s*['"](?:openai|@openai\/|@modelcontextprotocol\/)/,
    reason: 'forbidden dynamic import',
  },
  {
    pattern: /(?:OPENAI|CHATGPT|MCP)_[A-Z0-9_]+/,
    reason: 'forbidden integration environment variable',
  },
  {
    pattern: /window\.openai|window\.chatgpt|globalThis\.openai|globalThis\.chatgpt/i,
    reason: 'forbidden host global',
  },
  {
    pattern: /navigator\.serviceWorker|serviceWorker\.register/iu,
    reason: 'service worker registration is outside v1',
  },
  {
    pattern: /(?:fetch|WebSocket|EventSource)\s*\(\s*['"]https?:\/\/(?!127\.0\.0\.1|localhost)/iu,
    reason: 'hard-coded external runtime request',
  },
  {
    pattern:
      /(?:\bfetch\s*\(|navigator\.sendBeacon|new\s+(?:XMLHttpRequest|WebSocket|EventSource)\b)/u,
    reason: 'outbound runtime telemetry primitive',
  },
];

const errors = productionDependencies
  .filter((dependency) => forbiddenDependencyPatterns.some((pattern) => pattern.test(dependency)))
  .map((dependency) => `Forbidden production dependency: ${dependency}`);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(resolved)));
    else if (/\.(?:astro|ts|tsx|js|jsx|mjs)$/.test(entry.name)) files.push(resolved);
  }
  return files;
}

const sourceRoot = new URL('src/', root);
for (const file of await sourceFiles(sourceRoot.pathname)) {
  const contents = await readFile(file, 'utf8');
  const relative = path.relative(root.pathname, file);
  const isReviewedTelemetryTransport =
    relative === 'src/lib/telemetry/counts.ts' || relative === 'src/lib/telemetry/reporter.ts';
  for (const { pattern, reason } of forbiddenSourcePatterns) {
    if (reason === 'outbound runtime telemetry primitive' && isReviewedTelemetryTransport) {
      continue;
    }
    if (pattern.test(contents)) errors.push(`${relative}: ${reason}`);
  }
}

const distRoot = new URL('dist/', root);
try {
  await access(distRoot);
} catch {
  errors.push('dist/ is unavailable; build the standalone artifact before checking independence');
}

async function allFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await allFiles(resolved)));
    else files.push(resolved);
  }
  return files;
}

let builtFiles = [];
try {
  builtFiles = await allFiles(distRoot.pathname);
} catch {
  // The missing-dist error above is the actionable failure.
}

for (const file of builtFiles) {
  const relative = path.relative(distRoot.pathname, file);
  if (/(?:^|\/)(?:sw|service-worker)\.(?:js|mjs)$|\.webmanifest$/iu.test(relative)) {
    errors.push(`Forbidden offline/PWA artifact: dist/${relative}`);
  }

  if (!/\.(?:html|css|js|mjs)$/iu.test(relative)) continue;
  const contents = await readFile(file, 'utf8');
  if (
    telemetryMode === 'off' &&
    /\/api\/telemetry\/v1\/template-(?:uses|counts)|openmermaid-telemetry/iu.test(contents)
  ) {
    errors.push(`dist/${relative}: telemetry code appeared in the telemetry-off artifact`);
  }
  if (/navigator\.serviceWorker|serviceWorker\.register/iu.test(contents)) {
    errors.push(`dist/${relative}: contains service worker registration`);
  }

  if (relative.endsWith('.html')) {
    const resourcePatterns = [
      /<script\b[^>]*\bsrc=["']([^"']+)["']/giu,
      /<(?:img|source|iframe|embed|object)\b[^>]*\b(?:src|data)=["']([^"']+)["']/giu,
      /<link\b(?=[^>]*\brel=["'](?:stylesheet|modulepreload|preload)["'])[^>]*\bhref=["']([^"']+)["']/giu,
    ];
    for (const pattern of resourcePatterns) {
      for (const match of contents.matchAll(pattern)) {
        if (/^https?:\/\//iu.test(match[1])) {
          errors.push(`dist/${relative}: external runtime resource ${match[1]}`);
        }
      }
    }
  }

  if (relative.endsWith('.css')) {
    for (const match of contents.matchAll(/(?:url\(|@import\s+)["']?([^)'"\s]+)["']?/giu)) {
      if (/^https?:\/\//iu.test(match[1])) {
        errors.push(`dist/${relative}: external stylesheet resource ${match[1]}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`Standalone independence check failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(
  telemetryMode === 'off'
    ? `Standalone independence verified across source and ${String(builtFiles.length)} built files: no ChatGPT/OpenAI/MCP coupling, external runtime assets, third-party analytics, outbound telemetry, ads, or service worker.`
    : `Standalone independence verified across source and ${String(builtFiles.length)} built files: optional first-party aggregate telemetry is isolated from the shared core, with no ChatGPT/OpenAI/MCP coupling, external runtime assets, third-party analytics, ads, or service worker.`,
);
