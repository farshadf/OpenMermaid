import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestFilename = 'openmermaid-artifact-manifest.json';
const sha256Pattern = /^[a-f0-9]{64}$/u;
const secretFilenamePattern = /(?:^\.env(?:\.|$)|\.(?:key|p12|pem|pfx)$)/iu;
const telemetryMode = process.env.PUBLIC_TELEMETRY_MODE ?? 'off';
if (!['off', 'aggregate'].includes(telemetryMode)) {
  throw new Error('PUBLIC_TELEMETRY_MODE must be either "off" or "aggregate".');
}
const telemetryCatalog = JSON.parse(
  await readFile(path.join(projectRoot, 'services/telemetry/catalog.json'), 'utf8'),
);
if (
  typeof telemetryCatalog !== 'object' ||
  telemetryCatalog === null ||
  typeof telemetryCatalog.catalogVersion !== 'string' ||
  telemetryCatalog.catalogVersion.length === 0
) {
  throw new Error('The telemetry catalog version is unavailable for artifact provenance.');
}
const buildProfile = Object.freeze({
  telemetryMode,
  telemetryCatalogVersion: telemetryCatalog.catalogVersion,
});

function usage() {
  console.error(
    'Usage: node scripts/dist-manifest.mjs <write|verify> [--root <artifact-directory>]',
  );
  process.exit(2);
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (command !== 'write' && command !== 'verify') usage();

  let root = path.join(projectRoot, 'dist');
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] !== '--root' || index + 1 >= rest.length) usage();
    root = path.resolve(rest[index + 1]);
    index += 1;
  }

  return { command, root };
}

async function collectFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => {
    if (left.name < right.name) return -1;
    if (left.name > right.name) return 1;
    return 0;
  });

  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');

    if (relative === manifestFilename) continue;

    const metadata = await lstat(absolute);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Artifact must not contain symbolic links: ${relative}`);
    }
    if (metadata.isDirectory()) {
      files.push(...(await collectFiles(root, absolute)));
      continue;
    }
    if (!metadata.isFile()) {
      throw new Error(`Artifact contains an unsupported filesystem entry: ${relative}`);
    }
    if (/\.map$/iu.test(relative)) {
      throw new Error(`Artifact must not publish source maps: ${relative}`);
    }
    if (secretFilenamePattern.test(path.posix.basename(relative))) {
      throw new Error(`Artifact contains a secret-bearing filename: ${relative}`);
    }

    const contents = await readFile(absolute);
    files.push({
      path: relative,
      bytes: contents.byteLength,
      sha256: createHash('sha256').update(contents).digest('hex'),
    });
  }

  return files;
}

function createManifest(files) {
  return {
    schemaVersion: 2,
    algorithm: 'sha256',
    manifestPath: manifestFilename,
    buildProfile,
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    files,
  };
}

function validateManifestShape(manifest) {
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    manifest.schemaVersion !== 2 ||
    manifest.algorithm !== 'sha256' ||
    manifest.manifestPath !== manifestFilename ||
    typeof manifest.buildProfile !== 'object' ||
    manifest.buildProfile === null ||
    !['off', 'aggregate'].includes(manifest.buildProfile.telemetryMode) ||
    typeof manifest.buildProfile.telemetryCatalogVersion !== 'string' ||
    manifest.buildProfile.telemetryCatalogVersion.length === 0 ||
    !Number.isSafeInteger(manifest.fileCount) ||
    manifest.fileCount < 0 ||
    !Number.isSafeInteger(manifest.totalBytes) ||
    manifest.totalBytes < 0 ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error('Artifact manifest has an unsupported or malformed schema.');
  }

  const seen = new Set();
  for (const file of manifest.files) {
    if (
      typeof file !== 'object' ||
      file === null ||
      typeof file.path !== 'string' ||
      file.path.length === 0 ||
      file.path === manifestFilename ||
      file.path.startsWith('/') ||
      file.path.includes('\\') ||
      file.path
        .split('/')
        .some((segment) => segment === '' || segment === '.' || segment === '..') ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      typeof file.sha256 !== 'string' ||
      !sha256Pattern.test(file.sha256)
    ) {
      throw new Error('Artifact manifest contains a malformed file record.');
    }
    if (seen.has(file.path)) {
      throw new Error(`Artifact manifest contains a duplicate path: ${file.path}`);
    }
    seen.add(file.path);
  }
}

function compareManifests(actual, expected) {
  validateManifestShape(actual);

  if (
    actual.buildProfile.telemetryMode !== expected.buildProfile.telemetryMode ||
    actual.buildProfile.telemetryCatalogVersion !== expected.buildProfile.telemetryCatalogVersion ||
    actual.fileCount !== expected.fileCount ||
    actual.totalBytes !== expected.totalBytes ||
    actual.files.length !== expected.files.length
  ) {
    throw new Error('Artifact manifest summary does not match the built files.');
  }

  for (let index = 0; index < expected.files.length; index += 1) {
    const actualFile = actual.files[index];
    const expectedFile = expected.files[index];
    if (
      actualFile.path !== expectedFile.path ||
      actualFile.bytes !== expectedFile.bytes ||
      actualFile.sha256 !== expectedFile.sha256
    ) {
      throw new Error(
        `Artifact integrity mismatch at manifest record ${String(index)}: expected ${expectedFile.path}.`,
      );
    }
  }
}

async function main() {
  const { command, root } = parseArguments(process.argv.slice(2));
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error(`Artifact root is not a regular directory: ${root}`);
  }

  const manifestPath = path.join(root, manifestFilename);
  if (command === 'write') {
    try {
      const existingManifest = await lstat(manifestPath);
      if (!existingManifest.isFile() || existingManifest.isSymbolicLink()) {
        throw new Error('Refusing to overwrite a non-regular artifact manifest path.');
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }

  const files = await collectFiles(root);
  const expected = createManifest(files);

  if (command === 'write') {
    const temporaryManifestPath = path.join(
      root,
      `.${manifestFilename}.${String(process.pid)}.${randomUUID()}.tmp`,
    );
    let temporaryManifestCreated = false;
    try {
      await writeFile(temporaryManifestPath, `${JSON.stringify(expected, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o644,
      });
      temporaryManifestCreated = true;
      await rename(temporaryManifestPath, manifestPath);
      temporaryManifestCreated = false;
    } catch (writeError) {
      if (temporaryManifestCreated) {
        try {
          await unlink(temporaryManifestPath);
        } catch (cleanupError) {
          if (!(
            cleanupError instanceof Error &&
            'code' in cleanupError &&
            cleanupError.code === 'ENOENT'
          )) {
            throw new AggregateError(
              [writeError, cleanupError],
              'Artifact manifest write and temporary-file cleanup both failed.',
            );
          }
        }
      }
      throw writeError;
    }
    console.log(
      `Wrote ${path.relative(projectRoot, manifestPath)} for ${String(expected.fileCount)} files (${String(expected.totalBytes)} bytes).`,
    );
    return;
  }

  const manifestMetadata = await lstat(manifestPath);
  if (!manifestMetadata.isFile() || manifestMetadata.isSymbolicLink()) {
    throw new Error('Artifact manifest is not a regular file.');
  }

  let actual;
  try {
    actual = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error('Artifact manifest is not valid JSON.', { cause: error });
  }

  compareManifests(actual, expected);
  console.log(
    `Verified ${path.relative(projectRoot, root)} against ${String(expected.fileCount)} SHA-256 records.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
