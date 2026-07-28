import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const reportPath = path.join(projectRoot, 'reports', 'dependency-licenses.json');
const packageManagerCandidates =
  process.platform === 'win32'
    ? [
        { command: 'pnpm.cmd', prefix: [] },
        { command: 'corepack.cmd', prefix: ['pnpm'] },
      ]
    : [
        { command: 'pnpm', prefix: [] },
        { command: 'corepack', prefix: ['pnpm'] },
      ];

// These identifiers are accepted on their own. Reciprocal licenses deliberately
// do not appear here: they require an exact package-and-version review below.
const allowedLicenseIds = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'Python-2.0',
  'Unlicense',
]);

const allowedSpdxExceptions = new Set();

/**
 * Exact reviews for metadata corrections and licenses that are intentionally
 * absent from the general allowlist. A version bump or declared-license change
 * falls out of this map and fails closed.
 */
const reviewedPackages = new Map(
  [
    {
      name: 'khroma',
      version: '2.1.0',
      declaredLicense: 'Unknown',
      effectiveLicense: 'MIT',
      kind: 'metadata-correction',
      rationale:
        'The installed lowercase license file contains the standard MIT license; package.json omits the license field.',
    },
    {
      name: 'parse-cache-control',
      version: '1.0.1',
      declaredLicense: 'BSD',
      effectiveLicense: 'BSD-3-Clause',
      kind: 'metadata-correction',
      rationale:
        'The installed LICENSE text is the three-clause BSD license; the package metadata uses the non-SPDX label BSD.',
    },
    {
      name: '@axe-core/playwright',
      version: '4.12.1',
      declaredLicense: 'MPL-2.0',
      effectiveLicense: 'MPL-2.0',
      kind: 'reviewed-exception',
      rationale:
        'Development-only accessibility test adapter; its source is not bundled into the static site.',
    },
    {
      name: 'axe-core',
      version: '4.12.1',
      declaredLicense: 'MPL-2.0',
      effectiveLicense: 'MPL-2.0',
      kind: 'reviewed-exception',
      rationale:
        'Development-only accessibility test engine; its source is not bundled into the static site.',
    },
    {
      name: 'lightningcss',
      version: '1.33.0',
      declaredLicense: 'MPL-2.0',
      effectiveLicense: 'MPL-2.0',
      kind: 'reviewed-exception',
      rationale:
        'Build-time CSS transformer reached through Vite; Open Mermaid does not modify or redistribute its source files in dist.',
    },
    {
      name: 'lightningcss-linux-x64-gnu',
      version: '1.33.0',
      declaredLicense: 'MPL-2.0',
      effectiveLicense: 'MPL-2.0',
      kind: 'reviewed-exception',
      rationale:
        'Platform build binary for lightningcss; it is used in CI and is not included in the portable static artifact.',
    },
    {
      name: '@img/sharp-libvips-linux-x64',
      version: '1.3.2',
      declaredLicense: 'LGPL-3.0-or-later',
      effectiveLicense: 'LGPL-3.0-or-later',
      kind: 'reviewed-exception',
      rationale:
        'Unmodified platform build binary reached through Astro and sharp; it is not included in the portable static artifact.',
    },
  ].map((review) => [`${review.name}@${review.version}`, review]),
);

function runLicenseInventory(args) {
  let result;
  for (const { command, prefix } of packageManagerCandidates) {
    result = spawnSync(command, [...prefix, 'licenses', 'list', ...args, '--json'], {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (!(result.error && 'code' in result.error && result.error.code === 'ENOENT')) break;
  }

  if (result === undefined) {
    throw new Error('Unable to start pnpm or Corepack.');
  }
  if (result.error) {
    throw new Error('Unable to start pnpm or Corepack.', { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Unable to enumerate dependency licenses.');
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const rows = Array.isArray(parsed) ? parsed : Object.values(parsed).flat();
    if (!rows.every((row) => typeof row === 'object' && row !== null)) {
      throw new TypeError('The inventory contains a non-object record.');
    }
    return rows;
  } catch (error) {
    throw new Error('pnpm returned an unreadable license report.', { cause: error });
  }
}

function tokenize(expression) {
  const tokens = [];
  let offset = 0;

  while (offset < expression.length) {
    const character = expression[offset];
    if (/\s/u.test(character)) {
      offset += 1;
      continue;
    }
    if (character === '(' || character === ')') {
      tokens.push({ type: character, value: character });
      offset += 1;
      continue;
    }

    const start = offset;
    while (offset < expression.length && !/[\s()]/u.test(expression[offset])) offset += 1;
    const value = expression.slice(start, offset);
    tokens.push({ type: ['AND', 'OR', 'WITH'].includes(value) ? value : 'id', value });
  }

  return tokens;
}

function parseSpdxExpression(expression) {
  const tokens = tokenize(expression);
  let cursor = 0;

  const peek = () => tokens[cursor];
  const consume = (type) => {
    const token = tokens[cursor];
    if (!token || token.type !== type) {
      throw new SyntaxError(`Expected ${type}, found ${token?.value ?? 'end of expression'}.`);
    }
    cursor += 1;
    return token;
  };

  const parsePrimary = () => {
    if (peek()?.type === '(') {
      consume('(');
      const value = parseOr();
      consume(')');
      return value;
    }
    return { type: 'license', id: consume('id').value };
  };

  const parseWith = () => {
    const license = parsePrimary();
    if (peek()?.type !== 'WITH') return license;
    consume('WITH');
    return { type: 'with', license, exception: consume('id').value };
  };

  const parseAnd = () => {
    let value = parseWith();
    while (peek()?.type === 'AND') {
      consume('AND');
      value = { type: 'and', left: value, right: parseWith() };
    }
    return value;
  };

  const parseOr = () => {
    let value = parseAnd();
    while (peek()?.type === 'OR') {
      consume('OR');
      value = { type: 'or', left: value, right: parseAnd() };
    }
    return value;
  };

  if (tokens.length === 0) throw new SyntaxError('The license expression is empty.');
  const value = parseOr();
  if (cursor !== tokens.length) {
    throw new SyntaxError(`Unexpected token ${tokens[cursor].value}.`);
  }
  return value;
}

function evaluateSpdxNode(node) {
  if (node.type === 'license') {
    return allowedLicenseIds.has(node.id)
      ? { accepted: true, acceptedLicenseIds: [node.id], rejectedLicenseIds: [] }
      : { accepted: false, acceptedLicenseIds: [], rejectedLicenseIds: [node.id] };
  }

  if (node.type === 'with') {
    const license = evaluateSpdxNode(node.license);
    const exceptionAccepted = allowedSpdxExceptions.has(node.exception);
    return {
      accepted: license.accepted && exceptionAccepted,
      acceptedLicenseIds: license.acceptedLicenseIds,
      rejectedLicenseIds: [
        ...license.rejectedLicenseIds,
        ...(exceptionAccepted ? [] : [`WITH ${node.exception}`]),
      ],
    };
  }

  const left = evaluateSpdxNode(node.left);
  const right = evaluateSpdxNode(node.right);

  if (node.type === 'and') {
    return {
      accepted: left.accepted && right.accepted,
      acceptedLicenseIds: [...left.acceptedLicenseIds, ...right.acceptedLicenseIds],
      rejectedLicenseIds: [...left.rejectedLicenseIds, ...right.rejectedLicenseIds],
    };
  }

  // An SPDX OR expression grants a choice. Record only the accepted branch so
  // the report states which option the project relies on (Apache for DOMPurify).
  if (left.accepted) return left;
  if (right.accepted) return right;
  return {
    accepted: false,
    acceptedLicenseIds: [],
    rejectedLicenseIds: [...left.rejectedLicenseIds, ...right.rejectedLicenseIds],
  };
}

function verifyPolicyEvaluator() {
  const cases = [
    ['MIT AND BSD-3-Clause', true],
    ['MIT AND GPL-3.0-only', false],
    ['GPL-3.0-only OR MIT', true],
    ['GPL-3.0-only OR AGPL-3.0-only', false],
    ['MIT OR GPL-3.0-only AND AGPL-3.0-only', true],
    ['(MIT OR GPL-3.0-only) AND AGPL-3.0-only', false],
    ['MIT WITH Classpath-exception-2.0', false],
  ];

  for (const [expression, expected] of cases) {
    const actual = evaluateSpdxNode(parseSpdxExpression(expression)).accepted;
    if (actual !== expected) {
      throw new Error(
        `Internal SPDX policy test failed for ${expression}: expected ${expected}, received ${actual}.`,
      );
    }
  }
}

function evaluatePackage({ name, version, declaredLicense, scope, metadata }) {
  const packageKey = `${name}@${version}`;
  const review = reviewedPackages.get(packageKey);

  if (review && declaredLicense !== review.declaredLicense) {
    return {
      name,
      version,
      scope,
      declaredLicense,
      effectiveLicense: declaredLicense,
      accepted: false,
      decision: 'rejected',
      acceptedLicenseIds: [],
      reason: `Reviewed metadata changed; expected ${review.declaredLicense}.`,
      ...metadata,
    };
  }

  const effectiveLicense = review?.effectiveLicense ?? declaredLicense;
  if (review?.kind === 'reviewed-exception') {
    return {
      name,
      version,
      scope,
      declaredLicense,
      effectiveLicense,
      accepted: true,
      decision: 'reviewed-exception',
      acceptedLicenseIds: [effectiveLicense],
      review: { kind: review.kind, rationale: review.rationale },
      ...metadata,
    };
  }

  try {
    const evaluation = evaluateSpdxNode(parseSpdxExpression(effectiveLicense));
    return {
      name,
      version,
      scope,
      declaredLicense,
      effectiveLicense,
      accepted: evaluation.accepted,
      decision: evaluation.accepted
        ? review
          ? 'reviewed-classification'
          : 'allowed-license'
        : 'rejected',
      acceptedLicenseIds: [...new Set(evaluation.acceptedLicenseIds)].sort(),
      ...(evaluation.accepted
        ? {}
        : {
            reason: `No policy-compliant choice in ${effectiveLicense}; rejected terms: ${[
              ...new Set(evaluation.rejectedLicenseIds),
            ].join(', ')}.`,
          }),
      ...(review ? { review: { kind: review.kind, rationale: review.rationale } } : {}),
      ...metadata,
    };
  } catch (error) {
    return {
      name,
      version,
      scope,
      declaredLicense,
      effectiveLicense,
      accepted: false,
      decision: 'rejected',
      acceptedLicenseIds: [],
      reason: `Invalid or unsupported SPDX expression: ${error.message}`,
      ...metadata,
    };
  }
}

function flattenInventory(allRows, productionRows) {
  const productionKeys = new Set();
  for (const row of productionRows) {
    if (typeof row.name !== 'string' || !Array.isArray(row.versions)) continue;
    for (const version of row.versions) productionKeys.add(`${row.name}@${version}`);
  }

  const packages = [];
  const seenKeys = new Set();
  for (const row of allRows) {
    const validName = typeof row.name === 'string' && row.name.trim().length > 0;
    const name = validName ? row.name : '[missing package name]';
    const validVersions =
      Array.isArray(row.versions) &&
      row.versions.length > 0 &&
      row.versions.every((version) => typeof version === 'string' && version.length > 0);
    const versions = validVersions ? row.versions : ['[missing version]'];
    const declaredLicense =
      typeof row.license === 'string' && row.license.trim().length > 0 ? row.license : 'Unknown';
    const metadata = {
      ...(typeof row.homepage === 'string' && row.homepage ? { homepage: row.homepage } : {}),
      ...(typeof row.author === 'string' && row.author ? { author: row.author } : {}),
      ...(typeof row.description === 'string' && row.description
        ? { description: row.description }
        : {}),
    };

    for (const version of versions) {
      const packageKey = `${name}@${version}`;
      const scope = productionKeys.has(packageKey) ? 'production' : 'development';
      const evaluated = evaluatePackage({
        name,
        version: String(version),
        declaredLicense,
        scope,
        metadata,
      });
      const identityProblems = [
        ...(!validName ? ['missing package name'] : []),
        ...(!validVersions ? ['missing or invalid version list'] : []),
        ...(seenKeys.has(packageKey) ? ['duplicate package-and-version record'] : []),
      ];
      if (identityProblems.length > 0) {
        Object.assign(evaluated, {
          accepted: false,
          decision: 'rejected',
          acceptedLicenseIds: [],
          reason: `Invalid inventory metadata: ${identityProblems.join(', ')}.`,
        });
      }
      seenKeys.add(packageKey);
      packages.push(evaluated);
    }
  }

  for (const productionKey of productionKeys) {
    if (seenKeys.has(productionKey)) continue;
    const separator = productionKey.lastIndexOf('@');
    packages.push({
      name: productionKey.slice(0, separator),
      version: productionKey.slice(separator + 1),
      scope: 'production',
      declaredLicense: 'Unknown',
      effectiveLicense: 'Unknown',
      accepted: false,
      decision: 'rejected',
      acceptedLicenseIds: [],
      reason: 'Production dependency was absent from the complete installed inventory.',
    });
  }

  return packages.sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
  );
}

async function main() {
  verifyPolicyEvaluator();

  let allRows;
  let productionRows;
  try {
    allRows = runLicenseInventory([]);
    productionRows = runLicenseInventory(['--prod']);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const packages = flattenInventory(allRows, productionRows);
  const rejected = packages.filter((entry) => !entry.accepted);
  const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  const summary = {
    packageVersions: packages.length,
    productionPackageVersions: packages.filter((entry) => entry.scope === 'production').length,
    developmentPackageVersions: packages.filter((entry) => entry.scope === 'development').length,
    allowedByLicense: packages.filter((entry) => entry.decision === 'allowed-license').length,
    reviewedClassifications: packages.filter(
      (entry) => entry.decision === 'reviewed-classification',
    ).length,
    reviewedExceptions: packages.filter((entry) => entry.decision === 'reviewed-exception').length,
    rejected: rejected.length,
  };
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project: { name: packageJson.name, version: packageJson.version },
    packageManager: packageJson.packageManager,
    inventory: 'all installed production and development dependency versions',
    policy: {
      allowedLicenseIds: [...allowedLicenseIds].sort(),
      allowedSpdxExceptions: [...allowedSpdxExceptions].sort(),
      reviewedPackages: [...reviewedPackages.values()].map((review) => ({ ...review })),
    },
    summary,
    packages,
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (rejected.length > 0) {
    console.error(`Dependency license review required (${rejected.length} package versions):`);
    for (const entry of rejected) {
      console.error(
        `- ${entry.name}@${entry.version} [${entry.scope}]: ${entry.declaredLicense} — ${entry.reason}`,
      );
    }
    console.error(`Complete report: ${path.relative(projectRoot, reportPath)}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Dependency licenses passed for ${summary.packageVersions} installed package versions ` +
      `(${summary.productionPackageVersions} production, ${summary.developmentPackageVersions} development; ` +
      `${summary.reviewedClassifications} metadata classifications and ${summary.reviewedExceptions} exact exceptions).`,
  );
  console.log(`Complete report: ${path.relative(projectRoot, reportPath)}`);
}

await main();
