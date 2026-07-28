import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workflowDirectory = fileURLToPath(new URL('../.github/workflows/', import.meta.url));
const workflowFiles = (await readdir(workflowDirectory))
  .filter((filename) => /\.(?:yaml|yml)$/u.test(filename))
  .sort();
const failures = [];
let actionCount = 0;
let installCount = 0;

for (const filename of workflowFiles) {
  const contents = await readFile(path.join(workflowDirectory, filename), 'utf8');
  for (const match of contents.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu)) {
    actionCount += 1;
    const action = match[1];
    if (action.startsWith('./')) continue;

    const separator = action.lastIndexOf('@');
    const repository = separator === -1 ? '' : action.slice(0, separator);
    const revision = separator === -1 ? '' : action.slice(separator + 1);
    if (!/^[^/\s]+\/[^/@\s]+$/u.test(repository) || !/^[a-f0-9]{40}$/u.test(revision)) {
      failures.push(
        `${filename}:${String(contents.slice(0, match.index).split('\n').length)}: ${action} must use a full immutable commit SHA`,
      );
    }
  }

  for (const match of contents.matchAll(/^\s*run:\s*pnpm install([^\n]*)$/gmu)) {
    installCount += 1;
    const argumentsText = match[1];
    if (!/(?:^|\s)--frozen-lockfile(?:\s|$)/u.test(argumentsText)) {
      failures.push(
        `${filename}:${String(contents.slice(0, match.index).split('\n').length)}: pnpm install must freeze the lockfile`,
      );
    }
    if (!/(?:^|\s)--ignore-scripts(?:\s|$)/u.test(argumentsText)) {
      failures.push(
        `${filename}:${String(contents.slice(0, match.index).split('\n').length)}: pnpm install must explicitly disable lifecycle scripts`,
      );
    }
  }
}

if (actionCount === 0) failures.push('No GitHub Actions dependencies were found.');
if (installCount === 0) failures.push('No explicit CI dependency installation was found.');

if (failures.length > 0) {
  console.error(`GitHub Actions pin check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(
  `Verified ${String(actionCount)} immutable action references and ${String(installCount)} frozen, script-free dependency installs across ${String(workflowFiles.length)} workflows.`,
);
