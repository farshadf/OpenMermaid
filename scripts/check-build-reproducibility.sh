#!/usr/bin/env sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
manifest_path="$project_root/dist/openmermaid-artifact-manifest.json"
comparison_dir=$(mktemp -d)

cleanup() {
  rm -rf -- "$comparison_dir"
}
trap cleanup EXIT INT TERM

if [ ! -f "$manifest_path" ]; then
  echo "The first build manifest is missing; run pnpm build before this check." >&2
  exit 1
fi

run_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
  elif command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
  else
    echo "pnpm or Corepack is required to reproduce the build." >&2
    exit 1
  fi
}

cp "$manifest_path" "$comparison_dir/first-build.json"

echo "Rebuilding the static artifact to check deterministic output"
cd "$project_root"
run_pnpm build

if ! cmp -s "$comparison_dir/first-build.json" "$manifest_path"; then
  echo "Successive builds produced different artifact manifests." >&2
  diff --unified "$comparison_dir/first-build.json" "$manifest_path" >&2 || true
  exit 1
fi

node scripts/dist-manifest.mjs verify
echo "Successive builds produced the same file set and SHA-256 digests."
