# V1 release checklist

A public release requires evidence for every applicable item. “Not tested” is not a pass.

## Identity and governance

- [ ] Complete legal/trademark review of “Open Mermaid” and intended domains in target jurisdictions.
- [ ] Select one canonical TLD using `DOMAIN_SELECTION.md`; document availability, renewal, registrant, HTTPS, redirect, and recovery evidence.
- [ ] Verify domain ownership, repository URL, contact paths, and non-affiliation wording.
- [ ] Review MIT license, dependency-license policy, generated complete notices, and SBOM.
- [ ] For a published Docker image, close the pinned Alpine image's GPL/LGPL source, notice, and license-text obligations review; retain its exact container SBOM and applicable source locations.
- [ ] Review privacy notice, security policy, code of conduct, contribution guide, and third-party notices.
- [ ] Remove every `.example` canonical, sitemap, and contact value from the release artifact; verify security.txt contacts.

## Reproducible artifact

- [ ] Build from a clean reviewed commit with the exact `.node-version`, pinned pnpm, a frozen
      lockfile, and dependency lifecycle scripts disabled.
- [ ] Run formatting, lint, strict typecheck, unit tests, production build, and browser E2E.
- [ ] Run security corpus, accessibility, metadata/internal links, independence, audit, license, SBOM, bundle, and Lighthouse gates.
- [ ] Verify the deterministic SHA-256 artifact manifest and its tamper, extra-file, source-map,
      symlink, and future-schema failure contract.
- [ ] Confirm CI builds once and every quality, browser, and deployment job verifies and uses that
      same artifact; all remote actions are pinned to full commit SHAs.
- [ ] Record commit, dependency lock digest, artifact manifest/archive digest, browser versions, and
      test reports.
- [ ] Record the shipped image digest, pinned base-image digest, container SBOM, and deployment-contract report alongside the JavaScript SBOM.
- [ ] Confirm `dist/` contains no source maps, symbolic links, or files absent from its manifest.
- [ ] Confirm all ChatGPT/OpenAI/AI environment variables are absent during build and test.

## Mermaid contract

- [ ] One valid render fixture passes for every diagram family exposed by pinned Mermaid.
- [ ] Beta/experimental labels match the pinned upstream documentation.
- [ ] Invalid-source recovery and last-valid-preview retention pass.
- [ ] Timeout reset, serialization, and stale-result suppression pass.
- [ ] Parser, completion, snippet, tokenizer, Unicode, and maximum-source fixtures pass.

## Security and privacy

- [ ] Malicious scripts, handlers, URLs, resources, CSS, click directives, frontmatter, foreign content, and oversized inputs cause no unexpected request, navigation, dialog, or execution.
- [ ] Renderer iframe has exactly the intended sandbox flags and protocol validation.
- [ ] Exported SVG contains only sanitized output; PNG dimensions/backgrounds match selection and bounds.
- [ ] Fragment round trips, malformed/future envelopes, character rejection, decompression bombs, and URL limits pass.
- [ ] No general-purpose analytics, session replay, Open Mermaid identity tracking, remote font,
      runtime CDN, service worker, AI, ChatGPT, MCP, account, or cloud code appears in network or
      built dependencies. Agency code is present only in an explicitly approved agency artifact.
- [ ] The default telemetry-off artifact contains no telemetry bootstrap, request, queue, preference
      storage, or relaxed `connect-src` policy.
- [ ] The aggregate artifact transmits only the strict allowlisted template-use schema after
      explicit opt-in; source, titles, document/browser identifiers, URL state, search/filter state,
      performance, and ad data are absent.
- [ ] Opt-out and Global Privacy Control stop reporting and clear the retry queue; collector failure
      never blocks or changes the document workflow.
- [ ] Collector tests cover exact keys, allowlisted slugs, body/batch bounds, method, content type,
      origin rejection, retry deduplication, retention, thresholding, rounding, cache behavior, and
      zero raw-event storage.
- [ ] Ad-off output contains no advertising markup, CSS, bootstrap, manifest, request, storage, or
      CSP relaxation; placeholder output is noindexed and inert.
- [ ] If agency mode is enabled, the provider account/site, CMP, privacy notice, vendor inventory,
      `/ads.txt`, consent withdrawal, restricted-serving behavior, and reporting access are
      approved and current.
- [ ] Agency inventory is limited to one content stripe on guide/template detail pages; no provider
      code or request appears on the editor, renderer, fragment shares, homepage, indexes, policies,
      performance diagnostics, or 404.
- [ ] `PUBLIC_SITE_URL` and `PUBLIC_EDITOR_ORIGIN` use different hostnames, cookies are host-only,
      and canary request capture proves no diagram/editor/product-telemetry data reaches the agency.
- [ ] Local clear, storage failure, delete undo, and multi-tab conflicts have reviewed recovery paths.

## Accessibility and compatibility

- [ ] Automated axe has zero serious/critical findings in required states.
- [ ] Manual keyboard and screen-reader matrix is recorded.
- [ ] Forced colors, reduced motion, light/dark/system theme, 400% zoom, 320px, touch, and iOS Safari pass.
- [ ] Source/preview tabs expose state and restore focus predictably.
- [ ] All supported Chrome, Edge, Firefox, Safari, and iOS Safari versions pass the documented scope.
- [ ] Exported examples include equivalent source/prose and avoid automatic-accessibility claims.

## Discoverability and performance

- [ ] Production HTTPS origin is correct in canonical, Open Graph, JSON-LD, sitemap, and security.txt.
- [ ] Production is explicitly indexable; previews send both noindex metadata and `X-Robots-Tag`.
- [ ] User documents and fragments do not create indexable server routes.
- [ ] Landing, guide, template, and policy pages contain no Mermaid or CodeMirror chunk.
- [ ] Static content routes score at least 98 Lighthouse, targeting 100; the editor and interactive
      performance diagnostics meet at least 95 Performance and 100 Accessibility/Best Practices/SEO.
- [ ] Bundle budgets pass and field monitoring can measure LCP, INP, and CLS without sending local
      performance data to the aggregate template-use adapter.
- [ ] `/performance/` is local-only, history defaults off, clear/export work, and no performance
      telemetry request occurs.
- [ ] The canonical-origin CrUX history workflow is configured or explicitly deferred; missing launch traffic is informational.
- [ ] Agency-enabled pages have their own Lighthouse/Web Vitals cohort, zero unexpected
      ad-attributed CLS, stable no-fill/outage layout, one request cycle, and no refresh.
- [ ] `llms.txt` is accurate, supplemental, and makes no ranking claim.

## Deployment and rollback

- [ ] `pnpm test:deployment:browser` passes against the exact `dist/` artifact and Dockerfile selected for release.
- [ ] Resolved Compose configuration publishes container port 8080 only at host `127.0.0.1:8088`; no firewall rule exposes 8088 publicly.
- [ ] Runtime is non-root with a read-only root, all capabilities dropped, `no-new-privileges`, bounded PIDs/logs, no Docker socket, no credential, and no persistent content volume.
- [ ] If aggregate telemetry is enabled, its collector is separately packaged, publishes only to
      loopback, receives only its dedicated SQLite volume, exposes only the two exact public API
      routes through Caddy, and keeps `/healthz` private.
- [ ] `pnpm test:telemetry-deployment` passes against the aggregate profile, including the
      profile-bound artifact manifest, API rejection cases, persistence/deduplication, and
      collector CPU, memory, PID, file-descriptor, mount, and privilege limits.
- [ ] CI produced a collector container SBOM and the high-severity collector vulnerability scan
      passed.
- [ ] The complete host Caddyfile validates before reload; the existing public edge and unrelated sites are preserved.
- [ ] Public `/editor/` redirects to the editor hostname, public `/renderer/` is unavailable, and
      the editor hostname rejects public content routes that contain agency code.
- [ ] Caddy automatic HTTPS, canonical alias redirects, dynamic compression, HSTS scope, active `/healthz` checks, and loopback upstream are verified on the final host.
- [ ] HTTPS redirect, MIME types, main CSP, renderer CSP, permissions, referrer, framing, HSTS decision, and caching are verified on the final origin.
- [ ] Real 404 returns status 404 and noindex.
- [ ] Static assets use immutable caching; HTML and renderer entry revalidate.
- [ ] Fresh-context create/edit/reload/share/import/export smoke passes on deployed files.
- [ ] Network and console review shows no missing assets, CSP violations, unexpected hosts, repeated warnings, or renderer failures.
- [ ] Previous known-good immutable artifact and configuration are available and rollback was rehearsed.
- [ ] Container and Caddy journals were scanned after rollout; expected startup notices are separated from actionable warnings/errors.
- [ ] Post-release owner and vulnerability response channel are active.
