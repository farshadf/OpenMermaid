# Performance and Web Vitals measurement

Open Mermaid measures performance in three layers. Each layer answers a different question and none is presented as a substitute for the others.

## 1. Lab regression gates

Lighthouse CI runs repeated controlled builds for representative static routes, the editor, and the
interactive diagnostics page. Static content routes retain a hard performance floor of 98 with 100
Accessibility, Best Practices, and SEO. The editor and `/performance/` retain a performance floor
of 95 and 100 for the other categories. Bundle budgets, dependency boundaries, link/metadata
checks, and browser interaction tests provide additional regression evidence.

The editor also has a decoded startup-JavaScript ceiling of 145,000 bytes in Chromium. The gate
counts every same-origin JavaScript resource regardless of whether it was requested as a script or
module preload, and asserts that CodeMirror, the template catalog, sharing compression, SVG/PNG
export, SVG sanitization, the optional performance repository, and the Mermaid renderer stay
deferred until the feature that needs them is used. This is an initial-interactivity budget, not a
limit on the complete editor feature set.

Lighthouse measures LCP and CLS in the lab and uses Total Blocking Time as an interaction proxy. It cannot measure real INP without user interaction, so a green lab run is necessary but not sufficient field evidence.

## 2. On-device diagnostics

The `/performance/` page loads the pinned official `web-vitals` package after primary content. Other routes contain a tiny bootstrap that does not request the measurement chunk unless local history is already enabled. The package uses buffered performance entries, so deferred loading still captures earlier supported metrics.

History is **off by default**. Current-visit readings on `/performance/` are ephemeral unless the user explicitly enables “Save 30-day history in this browser.” No consent banner is needed for the default because no metric is persisted or transmitted; enabling history is an explicit local preference, not permission to send data anywhere.

Agency-enabled guide/template detail pages form a separate performance cohort. They intentionally
omit the local Web Vitals bootstrap, so no Open Mermaid performance identifier or measurement is
available to agency code. Measure them with isolated Lighthouse/WebPageTest runs and aggregate CrUX
evidence for the public origin. Compare ad-off, blocked, no-fill, consent-pending, restricted, and
filled cases; record provider transfer, request count, long tasks, console errors, and
ad-attributed layout-shift entries separately from the editor.

Persisted `LocalVitalSampleV1` records contain only:

- metric ID, name, numeric value, and rating;
- a fixed page-kind category rather than a URL;
- navigation type;
- small/large viewport class;
- measurement timestamp and schema version.

They never contain the raw pathname, query, fragment, referrer, user agent, IP address, diagram title/source, DOM node, selector, performance entry, resource URL, clipboard content, or account identifier. The application does not call `fetch`, XHR, WebSocket, or `sendBeacon` for local performance measurement. Runtime CSP keeps `connect-src 'none'`.

Performance records use a separate `openmermaid-performance` IndexedDB database. Limits are:

- 30-day retention;
- 1,000 records;
- 1 MiB total estimated serialized data;
- 2 KiB per validated record;
- upsert by metric instance so repeat CLS/INP reports do not inflate counts.

Oldest, expired, oversized, and malformed records are pruned or ignored. Storage failure never blocks document editing. “Clear local data” in the editor removes both diagram data and optional performance history; the diagnostics page also has a performance-only clear action.

Local p75 uses nearest-rank aggregation. Fewer than 20 matching samples are labeled **directional**. “This browser only” is always visible because local history cannot represent the site's user population.

The top-level collector cannot inspect work inside the sandboxed Mermaid renderer iframe. This limitation is intentional and must remain visible in the diagnostics UI.

The separately optional aggregate template-use adapter is not a performance collector. It accepts
only the fixed template-application schema and never receives Web Vitals, timing entries, resource
URLs, page state, or local performance-history records.

## 3. Production field health

After the selected canonical origin has enough eligible traffic, Chrome UX Report (CrUX) supplies aggregated real-user distributions without adding an analytics service to the application. CrUX data is origin-specific and uses rolling 28-day collection windows; the History API exposes overlapping weekly time-series points.

The optional `pnpm performance:crux` command and weekly workflow read `PUBLIC_SITE_URL` plus a CI-only `CRUX_API_KEY`. They query the canonical origin and `/editor/` separately for phone and desktop, write bounded aggregate JSON/Markdown artifacts, and never expose the key to the browser build. Missing configuration or insufficient CrUX data is informational during launch.

The workflow remains dormant until one canonical production origin is selected. PageSpeed Insights, Search Console, and CrUX Vis are valid manual views of the same broader field system.

## Objectives and response process

At the 75th percentile, segmented by mobile and desktop:

- LCP ≤ 2.5 seconds;
- INP ≤ 200 milliseconds;
- CLS ≤ 0.1.

FCP and TTFB are retained as diagnostic metrics, not additional Core Web Vitals claims.

When a regression appears:

1. confirm whether it is lab, one local browser, page-level CrUX, or origin-level CrUX evidence;
2. identify the affected release, route group, form factor, and collection window;
3. reproduce under controlled Lighthouse/DevTools conditions;
4. inspect bundle, request, main-thread, rendering, and layout evidence;
5. fix the smallest responsible seam and rerun all relevant gates;
6. monitor later field windows rather than declaring recovery from one lab run.

Ad-enabled performance, if ever authorized, must be measured as a separate configuration and cannot weaken the no-source-access boundary.
