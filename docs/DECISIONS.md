# Architecture decisions

This log records decisions that affect public contracts, security, privacy, or long-term dependency direction. New entries are append-only; superseding a decision adds a new entry and links the old one.

## ADR-001: Astro static output with one Preact editor island

- **Status:** Accepted
- **Date:** 2026-07-21

Use Astro static output for public content and the editor shell, hydrating one Preact island only on the editor route. This keeps semantic content independent of JavaScript while allowing a focused interactive application. Public pages must not receive Mermaid or CodeMirror chunks.

## ADR-002: TypeScript rather than a Rust/Wasm application core

- **Status:** Accepted
- **Date:** 2026-07-21

Use strict TypeScript throughout v1. Mermaid, CodeMirror, IndexedDB, DOM APIs, and Astro/Preact are native to this ecosystem; Rust/Wasm would add build and bridge complexity without improving the v1 security boundary. A future isolated compute module can use Rust/Wasm if measurement demonstrates a concrete need.

## ADR-003: No application backend in v1

- **Status:** Accepted
- **Date:** 2026-07-21

Documents, rendering, sharing, import, and export operate in the browser. The deployable artifact contains static files only. This makes the product useful without accounts, credentials, owner-funded infrastructure, or a platform connection and keeps the default privacy statement understandable.

## ADR-004: IndexedDB behind a repository contract

- **Status:** Accepted
- **Date:** 2026-07-21

Use IndexedDB through `idb` for structured multi-document persistence. Hide it behind `DiagramRepository` so migrations, tests, storage-failure handling, and future separately authorized repositories do not leak into UI code.

## ADR-005: Mermaid is authoritative; highlighting is best effort

- **Status:** Accepted
- **Date:** 2026-07-21

Use modular CodeMirror packages and an in-repository lightweight Mermaid highlighter/completion catalog. Do not depend on the outdated community grammar. `mermaid.parse()` in the renderer is the authoritative validator. Pin the full Mermaid release, label upstream early-maturity grammars, and maintain a fixture for every exposed diagram family.

## ADR-006: Render in a sandboxed application-owned iframe

- **Status:** Accepted
- **Date:** 2026-07-21

Mermaid and generated SVG remain outside the parent document. The iframe uses `sandbox="allow-scripts"`, an exact versioned postMessage protocol, strict secure Mermaid configuration, bounded work, and sanitization. The parent never inserts unsanitized or sanitized preview SVG; the iframe owns preview display. Sanitized output crosses the boundary only for explicit export/copy.

## ADR-007: Fragment snapshots are bounded and explicitly unencrypted

- **Status:** Accepted
- **Date:** 2026-07-21

Encode immutable `ShareEnvelopeV1` snapshots as `#v1:<base64url(zlib(JSON))>`. Enforce source, compressed, decompressed, character, and final-URL limits. Fragments avoid the ordinary HTTP request but are not encryption and cannot be revoked. Oversized diagrams fall back to `.mmd` export.

## ADR-008: Vanilla CSS and system assets

- **Status:** Accepted
- **Date:** 2026-07-21

Use design tokens, logical properties, container queries, system fonts, reduced-motion/forced-color handling, and repository-owned SVG assets. Do not add a UI framework, remote font, or runtime icon package. This supports the 320px and performance targets with minimal supply-chain and network cost.

## ADR-009: No service worker or offline guarantee in v1

- **Status:** Accepted
- **Date:** 2026-07-21

V1 is online-first and local-processing. It needs network access to load site assets, then persists documents locally. A service worker adds lifecycle, cache-invalidation, recovery, and security complexity and is deferred until explicit offline product requirements and tests exist.

## ADR-010: Advertising primitives render nothing in v1

- **Status:** Accepted
- **Date:** 2026-07-21

Define disabled `banner`, `content-rail`, and `editor-rail` layout primitives, but render no blank inventory, script, request, cookie, or reserved space. Future editor ads are allowed only in a fixed wide-screen rail from a separate-origin sandboxed iframe with no diagram source, URL fragment, editor DOM, or same-origin storage access.

## ADR-011: Future platform adapters depend on the core

- **Status:** Accepted
- **Date:** 2026-07-21

The standalone repository, renderer, downloader, URL codec, and host bridge ship in v1. A future ChatGPT App or AI generator is separately built and deployed and imports shared contracts. The web application and core never import ChatGPT, MCP, OpenAI, or provider SDKs or read their configuration.

## ADR-012: Indexing is an explicit release switch

- **Status:** Accepted
- **Date:** 2026-07-21

Preview and unconfigured builds emit noindex metadata. A release needs a verified final HTTPS `PUBLIC_SITE_URL` and explicit `PUBLIC_INDEX_SITE=true`. User documents remain in local storage or fragments and never become crawlable public pages. `llms.txt` is supplemental, not a ranking promise.

## ADR-013: The display name is Open Mermaid and the canonical TLD is a release input

- **Status:** Accepted
- **Date:** 2026-07-21

Use “Open Mermaid” with a space in public copy. Retain `openmermaid` only for technical identifiers where spaces are invalid or migration would create needless compatibility risk. Do not bind application behavior or persisted contracts to `.app`, `.us`, or another suffix. The final HTTPS `PUBLIC_SITE_URL` remains a validated release input, and only one production origin may be canonical.

## ADR-014: Adapt the Refero mood into an independent visual system

- **Status:** Accepted
- **Date:** 2026-07-21

Adopt the referenced midnight atmosphere, signal-blue restraint, flat paper product surfaces, hairline borders, small radii, and editorial hierarchy as general design principles. Use original Open Mermaid CSS and assets with system fonts. Do not copy Ameba screenshots, identity artwork, source code, text, or proprietary F37 Bolton typography. Accessibility and performance constraints override visual-reference details.

## ADR-015: Web Vitals are local-first with separate aggregate field evidence

- **Status:** Accepted
- **Date:** 2026-07-21

Keep Lighthouse CI as the lab regression gate. Measure the current `/performance/` visit locally and make bounded 30-day browser history explicit opt-in. Persist only a strict privacy-minimized schema in a separate database and transmit nothing. After a canonical origin is chosen, obtain population field evidence from aggregate Chrome UX Report data through CI or public tools. Local readings must never be described as site-wide field data.

## ADR-016: Host Caddy fronts an artifact-only static container

- **Status:** Accepted
- **Date:** 2026-07-22

Use host-installed Caddy as the only public listener on ports 80/443 and proxy to an unprivileged static container explicitly published at `127.0.0.1:8088`. Package the already-tested `dist/` in a digest-pinned Nginx image; never rebuild application source in the runtime image. Caddy owns public HTTPS, canonical redirects, dynamic compression, HSTS, and proxy health checks. The inner server owns MIME, cache rules, route-specific response headers, `/healthz`, and real 404 behavior.

Keep Caddy outside Compose so it can serve other host applications and remain available across Open Mermaid replacements and rollbacks. The container receives no source, credential, Docker socket, persistent content volume, or browser document data. `dist/` remains provider-neutral, and alternative compliant static hosts remain supported.
