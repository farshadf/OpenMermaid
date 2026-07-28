# Open Mermaid

Open Mermaid is a Mermaid editor that runs as a standalone static web application. It provides a
local multi-document workspace, a complete visual template catalog, live validation and preview,
immutable snapshot links, sanitized SVG or PNG export, and privacy-preserving performance
diagnostics without requiring an account, application backend, API key, ChatGPT connection, or
runtime CDN.

> Project status: v1 is under active development. Do not treat the current name, example domain, or preview deployment as launch clearance. Complete the release checklist, including name/domain/trademark review, before a public launch.

## Product principles

- **Standalone first.** The editor and shared core do not import ChatGPT, MCP, OpenAI, or AI-provider packages and do not read their configuration.
- **Local by default.** Diagram content stays on the device unless the user explicitly shares, copies, imports, or exports it.
- **Static and portable.** `pnpm build` produces a provider-neutral `dist/` directory for an HTTPS static host.
- **Untrusted source stays isolated.** Mermaid runs in an application-owned sandboxed iframe. Only sanitized output can be copied or exported.
- **Fast public pages.** Landing, guide, template, and policy pages are prerendered and do not ship Mermaid or CodeMirror JavaScript.
- **Accessible authoring, honest claims.** The application targets WCAG 2.2 AA for its shell and preserves source, but does not claim arbitrary user-authored diagrams are automatically accessible.

## V1 capabilities

- Strict TypeScript, Astro static output, and one Preact editor island
- CodeMirror 6 source editing, search, history, diagnostics, keyboard commands, and maintained Mermaid snippets
- Every diagram family in the pinned full Mermaid release, with upstream beta and experimental labels
- IndexedDB document library with autosave, duplicate/rename/search, delete undo, revisions, and multi-tab conflict detection
- Imports for `.mmd`, `.mermaid`, text, and Mermaid-fenced Markdown
- Source, sanitized SVG, and PNG exports at 1x/2x/3x with transparent, light, or dark backgrounds
- Sandboxed live preview with bounded rendering, stale-result suppression, and last-valid-preview retention
- Fragment snapshot sharing with compressed and decompressed size limits
- Static templates, substantive guides, canonical metadata, structured data, sitemap, robots policy, and `llms.txt`
- Lighthouse CI, opt-in local Web Vitals history, and an optional aggregate CrUX reporting workflow
- An optional, separately deployed aggregate template-use adapter with explicit opt-in, a strict
  data allowlist, prior-day privacy-coarsened counts, and no diagram content

Version 1 deliberately excludes accounts, a document backend, cloud sync, collaboration, public
galleries, general-purpose analytics, session replay, identity tracking, AI, ChatGPT code, active
ads, service workers/offline guarantees, PDF, JPEG, and a visual drag-and-drop builder. Aggregate
template-use reporting is an optional adapter; the default build contains no telemetry client or
request and remains fully functional without the collector.

## Requirements

- Node.js 24 LTS
- pnpm 10 (the exact package-manager release is pinned in `package.json`)
- A current supported Chrome, Edge, Firefox, Safari, or iOS Safari for browser testing
- Docker Engine with the Compose plugin for the self-hosted deployment gate

## Local development

```bash
corepack enable
pnpm install --frozen-lockfile --ignore-scripts
cp .env.example .env
pnpm dev
```

The example configuration intentionally uses `https://openmermaid.example` and disables indexing. For a release, set the final HTTPS origin and explicitly enable indexing only after clearance and metadata review.

```dotenv
PUBLIC_SITE_URL=https://openmermaid.example
PUBLIC_INDEX_SITE=false
```

Common commands:

```bash
pnpm format:check       # formatting
pnpm lint               # static linting and banned-import rules
pnpm typecheck          # Astro and TypeScript checks
pnpm test:unit          # unit, contract, and security corpus tests
pnpm test:coverage      # enforced coverage thresholds for the pure shared core
pnpm build              # checked static production build
pnpm test:artifact-contract # artifact tamper, extra-file, map, secret, and symlink rejection
pnpm test:build-reproducibility # byte-identical successive-build verification
pnpm test:ci-config     # immutable GitHub Action and script-free install policy
pnpm test:e2e           # Chromium, Firefox, and WebKit workflows
pnpm test:metadata      # links, metadata, chunks, robots, and sitemap
pnpm test:deployment    # hardened Docker image and Caddy HTTP contract
pnpm test:deployment:browser # deployed editor/renderer smoke (needs Chromium)
pnpm test:independence  # standalone dependency/environment contract
pnpm test:licenses      # dependency-license policy
pnpm sbom               # CycloneDX software bill of materials
pnpm performance:crux   # optional aggregate production field report
```

Run the broad local release gate with `pnpm test:all`. Browser installation for Playwright is environment-specific; CI installs the pinned browsers and additionally runs Lighthouse and the online production-dependency audit.

## Architecture at a glance

```text
Static Astro pages                 Editor route
  semantic HTML                      Preact island
  static SVG examples                CodeMirror source
  no Mermaid/CodeMirror JS            local document service
                                      validated host bridge
                                              |
                                  application-owned sandboxed iframe
                                    Mermaid + sanitizer only
```

The shared document, repository, URL codec, downloader, and renderer protocol point inward to provider-neutral contracts. Optional future adapters point toward those contracts; the web application never points toward ChatGPT or an AI service. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DECISIONS.md](docs/DECISIONS.md) for boundaries and decisions.

## Security and privacy

The standalone privacy wording is:

> Diagram content stays on this device unless you explicitly share or export it.

A fragment link is compressed, not encrypted. The fragment is normally absent from the HTTP request, but recipients, browser history, clipboard tools, extensions, screenshots, and any application where it is pasted may still see it. Sensitive material should use an approved secure file-sharing path instead.

The `/performance/` page measures the current visit locally. Thirty-day history is off by default and stores only bounded metric values and fixed page categories when explicitly enabled. It never stores diagram source, titles, raw URLs, fragments, DOM entries, referrers, or user-agent strings, and it sends no performance data over the network. See [docs/PERFORMANCE_MEASUREMENT.md](docs/PERFORMANCE_MEASUREMENT.md).

See [SECURITY.md](SECURITY.md), the public [security overview](src/pages/security.astro), and [docs/SECURITY_HEADERS.md](docs/SECURITY_HEADERS.md). Report vulnerabilities through a private GitHub security advisory, not a public issue.

## Deployment

Set a real canonical origin, keep preview indexing disabled, and build a portable artifact:

```bash
PUBLIC_SITE_URL=https://example.org \
PUBLIC_INDEX_SITE=true \
pnpm build:release
```

The canonical self-hosted profile packages the already-tested `dist/` in a pinned, unprivileged static image and publishes it only at `127.0.0.1:8088`. Host-installed Caddy remains the sole public edge on ports 80/443 and owns certificates, redirects, compression, HSTS, and proxy health checks:

```text
Internet -> host Caddy :80/:443 -> 127.0.0.1:8088 -> static container :8080
```

No Node process, backend, account, credential, or writable content volume exists at runtime. The final TLD remains a release input; set Caddy and `PUBLIC_SITE_URL` to the same cleared canonical origin. Follow [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) for safe existing-Caddy integration, setup from scratch, validation, log inspection, updates, and rollback. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the provider-neutral contract and other static hosts.

Operators who deliberately enable aggregate template-use reporting add a separate same-origin
collector and SQLite volume; the static application and document workflows remain independent.
See [docs/AGGREGATE_TELEMETRY.md](docs/AGGREGATE_TELEMETRY.md) for the exact payload, consent,
retention, deployment, and verification contract.

## Contributing and governance

- [CONTRIBUTING.md](CONTRIBUTING.md) — development workflow and review expectations
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community behavior and enforcement
- [DEPENDENCY_LICENSE_POLICY.md](DEPENDENCY_LICENSE_POLICY.md) — license acceptance and escalation
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — direct runtime dependency notices
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) — accessibility quality bar
- [docs/NAME_CLEARANCE.md](docs/NAME_CLEARANCE.md) — pre-launch identity hold points
- [docs/DOMAIN_SELECTION.md](docs/DOMAIN_SELECTION.md) — `.app` and `.us` decision criteria
- [docs/DESIGN.md](docs/DESIGN.md) — visual tokens, inspiration boundary, and UI rules
- [docs/PERFORMANCE_MEASUREMENT.md](docs/PERFORMANCE_MEASUREMENT.md) — lab, local, and production field system
- [docs/ADVERTISING.md](docs/ADVERTISING.md) — staged, privacy-preserving advertising implementation plan
- [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) — evidence required before launch

Automated dependency updates are configured with Dependabot. Release CI runs frozen installation, formatting, lint, type checks, unit and browser tests, accessibility and security checks, metadata and bundle checks, audit, license validation, SBOM generation, and Lighthouse budgets.

## Future adapters

A future ChatGPT App can be a separately deployed widget and MCP service that imports the shared contracts. It may accept explicit source or an Open Mermaid URL from the active chat, open a fullscreen-capable editor, and return a result only after an explicit **Send to chat** action. It cannot depend on arbitrary transcript access or scrape `chatgpt.com/share` pages. See [docs/FUTURE_INTEGRATIONS.md](docs/FUTURE_INTEGRATIONS.md).

AI generation, if introduced, must use separately approved funding, user-supplied credentials, or another non-owner-funded model and enter through the same validated document-creation path. There is no speculative AI interface in v1.

## License and affiliation

Open Mermaid is licensed under the [MIT License](LICENSE). Third-party components retain their own licenses.

Open Mermaid is an independent project and is not affiliated with, endorsed by, or sponsored by the Mermaid project or OpenAI. The name and domain require legal/trademark clearance before launch.
