import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const manifestUrl = new URL('openmermaid-advertising-manifest.json', dist);
const adsTxtUrl = new URL('ads.txt', dist);
const mode = process.env.PUBLIC_AD_MODE ?? 'off';
const errors = [];

if (!['off', 'placeholder', 'agency'].includes(mode)) {
  errors.push('PUBLIC_AD_MODE must be "off", "placeholder", or "agency".');
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

let manifestExists = true;
try {
  await access(manifestUrl);
} catch {
  manifestExists = false;
}
let adsTxtExists = true;
try {
  await access(adsTxtUrl);
} catch {
  adsTxtExists = false;
}

const placementRoutes = [];
for (const file of await htmlFiles(dist.pathname)) {
  const relative = path.relative(dist.pathname, file).replaceAll(path.sep, '/');
  const html = await readFile(file, 'utf8');
  const placementCount = [...html.matchAll(/data-ad-placement="content-stripe"/gu)].length;
  const hasProviderCode =
    html.includes('pagead2.googlesyndication.com') ||
    html.includes('data-ad-provider="google-adsense"');
  const eligible =
    /^guides\/[^/]+\/index\.html$/u.test(relative) ||
    /^templates\/[^/]+\/index\.html$/u.test(relative);

  if (placementCount > 0) {
    placementRoutes.push(relative);
    if (!eligible) errors.push(`${relative}: advertising appeared on an ineligible route.`);
    if (placementCount !== 1) {
      errors.push(`${relative}: expected exactly one content-stripe placement.`);
    }
  }
  if (!eligible && hasProviderCode) {
    errors.push(`${relative}: agency provider code appeared on an ineligible route.`);
  }
  if (
    relative === 'editor/index.html' &&
    /(?:data-ad-|googlesyndication|adsbygoogle|Advertisement)/iu.test(html)
  ) {
    errors.push('editor/index.html: editor artifact contains advertising code or markup.');
  }

  if (mode === 'off' && (placementCount > 0 || hasProviderCode || html.includes('agency-ad'))) {
    errors.push(`${relative}: advertising bytes appeared in the ad-off artifact.`);
  }
  if (mode === 'placeholder' && placementCount > 0) {
    if (!html.includes('data-ad-placeholder')) {
      errors.push(`${relative}: placeholder build is missing its inert marker.`);
    }
    if (hasProviderCode) {
      errors.push(`${relative}: placeholder build contains agency provider code.`);
    }
    if (!/<meta\b[^>]*name="robots"[^>]*content="noindex, nofollow"/iu.test(html)) {
      errors.push(`${relative}: placeholder appeared on an indexable page.`);
    }
  }
  if (mode === 'agency' && placementCount > 0) {
    for (const expected of [
      'data-ad-provider="google-adsense"',
      'data-ad-client="ca-pub-',
      'data-ad-slot="',
      'data-consent-strategy',
      'Advertisement',
      "script-src 'strict-dynamic' 'unsafe-inline' 'unsafe-eval'",
    ]) {
      if (!html.includes(expected))
        errors.push(`${relative}: missing agency contract ${expected}.`);
    }
    if (html.includes('data-ad-placeholder')) {
      errors.push(`${relative}: production agency page contains a development placeholder.`);
    }
    if (/<script\b[^>]*src="https:\/\/pagead2\.googlesyndication\.com/iu.test(html)) {
      errors.push(`${relative}: provider script must be origin-gated by the local bootstrap.`);
    }
    if (/VitalsBootstrap[^"']*\.js/iu.test(html)) {
      errors.push(`${relative}: ad route unexpectedly ships the local performance bootstrap.`);
    }
  }
}

placementRoutes.sort();
if (mode === 'off' && manifestExists) {
  errors.push('Ad-off artifact must not contain an advertising manifest.');
}
if (mode !== 'agency' && adsTxtExists) {
  errors.push(`${mode} artifact must not publish ads.txt.`);
}
if (mode === 'agency' && !adsTxtExists) {
  errors.push('Agency artifact is missing ads.txt.');
}
if (mode !== 'off' && !manifestExists) {
  errors.push(`${mode} artifact is missing its advertising manifest.`);
}
if (mode !== 'off' && placementRoutes.length === 0) {
  errors.push(`${mode} artifact contains no eligible advertising placements.`);
}

if (manifestExists) {
  try {
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    const manifestRoutes = manifest.placements?.[0]?.routes;
    if (
      manifest.schemaVersion !== 1 ||
      manifest.mode !== mode ||
      JSON.stringify(manifestRoutes) !== JSON.stringify(placementRoutes)
    ) {
      errors.push('Advertising manifest does not match the built placement inventory.');
    }
    if (mode === 'agency') {
      if (
        manifest.provider !== 'google-adsense' ||
        !/^[a-f0-9]{64}$/u.test(manifest.accountHash ?? '') ||
        manifest.publicOrigin === manifest.editorOrigin
      ) {
        errors.push(
          'Agency advertising manifest is incomplete or does not prove origin isolation.',
        );
      }
    }
  } catch {
    errors.push('Advertising manifest is not valid JSON.');
  }
}
if (adsTxtExists) {
  const adsTxt = await readFile(adsTxtUrl, 'utf8');
  const expectedPublisher = process.env.PUBLIC_ADSENSE_CLIENT?.replace(/^ca-/u, '');
  if (
    mode !== 'agency' ||
    adsTxt !== `google.com, ${expectedPublisher}, DIRECT, f08c47fec0942fa0\n`
  ) {
    errors.push('ads.txt does not exactly match the configured authorized Google seller record.');
  }
}

if (errors.length > 0) {
  console.error(`Advertising build contract failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(
  mode === 'off'
    ? 'Advertising build contract passed: ad-off artifact contains no advertising runtime or manifest.'
    : `Advertising build contract passed for ${mode} mode across ${String(placementRoutes.length)} eligible routes.`,
);
