import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestScript = fileURLToPath(new URL('dist-manifest.mjs', import.meta.url));
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'openmermaid-artifact-'));
const manifestPath = path.join(temporaryRoot, 'openmermaid-artifact-manifest.json');

function run(command, environment = {}) {
  return spawnSync(process.execPath, [manifestScript, command, '--root', temporaryRoot], {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
}

function assertSuccess(result, operation) {
  assert.equal(
    result.status,
    0,
    `${operation} failed:\n${result.stderr || result.stdout || 'no output'}`,
  );
}

function assertFailure(result, operation) {
  assert.notEqual(result.status, 0, `${operation} unexpectedly succeeded.`);
}

try {
  await mkdir(path.join(temporaryRoot, 'nested'));
  await writeFile(path.join(temporaryRoot, 'alpha.txt'), 'alpha\n');
  await writeFile(path.join(temporaryRoot, 'nested', 'beta.txt'), 'beta\n');

  assertSuccess(run('write'), 'Initial manifest write');
  const firstManifestText = await readFile(manifestPath, 'utf8');
  const firstManifest = JSON.parse(firstManifestText);
  assert.equal(firstManifest.schemaVersion, 2);
  assert.deepEqual(firstManifest.buildProfile, {
    telemetryMode: 'off',
    telemetryCatalogVersion: '11.16.0-v2',
  });
  assert.equal(firstManifest.fileCount, 2);
  assert.deepEqual(
    firstManifest.files.map((file) => file.path),
    ['alpha.txt', 'nested/beta.txt'],
  );
  assert.ok(
    firstManifest.files.every((file) => file.path !== 'openmermaid-artifact-manifest.json'),
    'The manifest must exclude itself to avoid a recursive checksum.',
  );
  assertSuccess(run('verify'), 'Valid artifact verification');
  assertFailure(
    run('verify', { PUBLIC_TELEMETRY_MODE: 'aggregate' }),
    'Mismatched telemetry deployment profile verification',
  );

  assertSuccess(run('write'), 'Repeated manifest write');
  assert.equal(
    await readFile(manifestPath, 'utf8'),
    firstManifestText,
    'Writing an unchanged artifact manifest must be deterministic.',
  );
  assert.deepEqual(
    (await readdir(temporaryRoot)).filter((entry) =>
      entry.startsWith('.openmermaid-artifact-manifest.json.'),
    ),
    [],
    'Atomic manifest writes must not leave temporary files behind.',
  );

  await writeFile(path.join(temporaryRoot, 'alpha.txt'), 'tampered\n');
  assertFailure(run('verify'), 'Tampered artifact verification');
  assertSuccess(run('write'), 'Manifest refresh after test tamper');

  await writeFile(path.join(temporaryRoot, 'unexpected.txt'), 'unexpected\n');
  assertFailure(run('verify'), 'Unexpected artifact file verification');
  await rm(path.join(temporaryRoot, 'unexpected.txt'));

  await writeFile(path.join(temporaryRoot, 'bundle.js.map'), '{}\n');
  assertFailure(run('write'), 'Source-map artifact write');
  await rm(path.join(temporaryRoot, 'bundle.js.map'));

  await writeFile(path.join(temporaryRoot, '.env.production'), 'SECRET=value\n');
  assertFailure(run('write'), 'Secret-bearing artifact write');
  await rm(path.join(temporaryRoot, '.env.production'));

  await symlink('alpha.txt', path.join(temporaryRoot, 'linked.txt'));
  assertFailure(run('write'), 'Symbolic-link artifact write');
  await rm(path.join(temporaryRoot, 'linked.txt'));

  const outsideManifestTarget = `${temporaryRoot}-outside`;
  await writeFile(outsideManifestTarget, 'must remain unchanged\n');
  await rm(manifestPath);
  await symlink(outsideManifestTarget, manifestPath);
  assertFailure(run('write'), 'Symbolic-link manifest overwrite');
  assert.equal(await readFile(outsideManifestTarget, 'utf8'), 'must remain unchanged\n');
  await rm(manifestPath);
  await rm(outsideManifestTarget);

  assertSuccess(run('write'), 'Final valid manifest write');
  const malformed = JSON.parse(await readFile(manifestPath, 'utf8'));
  malformed.schemaVersion = 3;
  await writeFile(manifestPath, `${JSON.stringify(malformed)}\n`);
  assertFailure(run('verify'), 'Future manifest schema verification');

  console.log(
    'Artifact manifest contract passed: deterministic output and fail-closed integrity checks.',
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
