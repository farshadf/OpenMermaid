# Contributing to Open Mermaid

Thank you for helping make browser-based diagramming safer, faster, and easier to understand. Contributions are welcome when they preserve the standalone architecture, privacy boundary, accessibility target, and performance budget.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before opening a change

1. Search existing issues and pull requests.
2. Use an issue for substantial product, security-boundary, dependency, persistence-schema, or public-contract changes.
3. Never put private diagram content, credentials, or unpatched vulnerability details in a public issue.
4. Keep the change focused. Separate refactors from behavior changes when practical.

## Development setup

Use Node 24 LTS and the pinned pnpm 10 release.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

The default environment is a non-indexable preview with an example canonical origin. Do not enable release indexing in local or pull-request deployments.

## Architecture rules

- The standalone web app and shared core must not import ChatGPT, MCP, OpenAI, or AI-provider packages or read their environment variables.
- Browser persistence and diagram processing remain local unless the user performs an explicit output action.
- Mermaid executes only in the sandboxed renderer. The application parent never inserts unsanitized SVG.
- `securityLevel: "strict"`, secure Mermaid configuration, source/edge limits, and sanitization policy are not user-configurable.
- Public static pages must not depend on Mermaid or CodeMirror chunks.
- No runtime CDN, remote font, network analytics service, outbound telemetry, session replay, ad
  provider, or service worker may be added to v1.
- Shared contracts remain provider-neutral. Future integrations depend on the core; the core never depends on integrations.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DECISIONS.md](docs/DECISIONS.md) before changing a boundary.

## Coding and content standards

- Use strict TypeScript and avoid unchecked casts at untrusted boundaries.
- Keep UI strings in the centralized English catalog and use logical CSS properties so RTL layouts remain possible.
- Use semantic HTML, visible focus states, keyboard-operable controls, reduced-motion behavior, and minimum 44px touch targets where applicable.
- Do not claim arbitrary generated diagrams are accessible; preserve source and explain author responsibilities.
- Mark Mermaid beta and experimental grammars from upstream and maintain a valid fixture for every supported family.
- Keep public guide and template pages substantive: visible source, static accessible example, explanation, common errors, and related links.
- Add or update tests with behavior changes. Security fixes require a regression fixture.

## Validation

Before requesting review, run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:metadata
pnpm test:independence
pnpm test:licenses
```

Run `pnpm test:e2e` when browser behavior, import/export, storage, rendering, layout, or accessibility changes. Use the full `pnpm test:all` gate before a release candidate.

Run `pnpm test:deployment:browser` when changing the Dockerfile, Compose profile, static-server rules, response headers, Caddy configuration, build artifact shape, or self-hosting documentation. It requires Docker Compose and an installed Playwright Chromium browser.

Manual review remains required for keyboard navigation, a screen reader smoke test, forced colors, reduced motion, 400% zoom, 320px layouts, touch interaction, and content quality.

## Pull requests

Describe:

- the user problem and resulting behavior;
- security, privacy, accessibility, performance, and compatibility effects;
- automated and manual evidence;
- migrations or rollback needs;
- dependency and license changes;
- screenshots only when they add review value and contain no sensitive content.

Do not lower a test, accessibility, performance, bundle, or license threshold just to make a change pass. Explain any intentional threshold revision and obtain maintainer review.

## Dependency changes

Prefer browser-native capabilities and small modular packages. Pin versions, document the purpose, verify provenance and maintenance, review the license under [DEPENDENCY_LICENSE_POLICY.md](DEPENDENCY_LICENSE_POLICY.md), inspect bundle impact, and update notices or SBOM inputs as needed.

## Reporting security issues

Follow [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability that has not been coordinated with maintainers.
