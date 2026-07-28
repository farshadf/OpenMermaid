import { createHash } from 'node:crypto';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const manifestUrl = new URL('openmermaid-advertising-manifest.json', dist);
const adsTxtUrl = new URL('ads.txt', dist);
const mode = process.env.PUBLIC_AD_MODE ?? 'off';

if (!['off', 'placeholder', 'agency'].includes(mode)) {
  throw new Error('PUBLIC_AD_MODE must be "off", "placeholder", or "agency".');
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

if (mode === 'off') {
  try {
    await unlink(manifestUrl);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  try {
    await unlink(adsTxtUrl);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  console.log('Advertising manifest omitted for ad-off build.');
  process.exit(0);
}

const placementRoutes = [];
for (const file of await htmlFiles(dist.pathname)) {
  const html = await readFile(file, 'utf8');
  if (!html.includes('data-ad-placement="content-stripe"')) continue;
  placementRoutes.push(path.relative(dist.pathname, file).replaceAll(path.sep, '/'));
}
placementRoutes.sort();

const manifest = {
  schemaVersion: 1,
  policyVersion: '2026-07-28',
  mode,
  placements: [
    {
      id: 'content-stripe',
      routeKinds: ['guide-detail', 'template-detail'],
      routes: placementRoutes,
      refresh: false,
    },
  ],
  ...(mode === 'agency'
    ? {
        provider: 'google-adsense',
        publicOrigin: new URL(process.env.PUBLIC_SITE_URL).origin,
        editorOrigin: new URL(process.env.PUBLIC_EDITOR_ORIGIN).origin,
        accountHash: createHash('sha256')
          .update(`${process.env.PUBLIC_ADSENSE_CLIENT}:${process.env.PUBLIC_ADSENSE_SLOT}`, 'utf8')
          .digest('hex'),
        consentStrategy: 'google-privacy-messaging',
        providerOrigins: ['https://pagead2.googlesyndication.com'],
      }
    : {}),
};

await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
if (mode === 'agency') {
  const publisherId = process.env.PUBLIC_ADSENSE_CLIENT.replace(/^ca-/u, '');
  await writeFile(adsTxtUrl, `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`, 'utf8');
} else {
  try {
    await unlink(adsTxtUrl);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
console.log(
  `Wrote advertising manifest for ${String(placementRoutes.length)} ${mode} placement routes.`,
);
