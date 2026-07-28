# Provider-neutral static deployment

Open Mermaid ships as a static `dist/` artifact. No Node process, database, account service, API
key, OpenAI/ChatGPT connection, or server-side rendering is required for the application runtime.
An optional aggregate template-use profile adds a separately packaged same-origin collector; the
static application remains fully functional without it.

## Release inputs

- Node 24 LTS and the pinned pnpm 10 release
- frozen `pnpm-lock.yaml`
- reviewed source commit with passing CI
- final HTTPS canonical origin with no path component
- explicit decision to enable indexing
- explicit `PUBLIC_TELEMETRY_MODE=off|aggregate` decision; unset defaults to `off`
- one canonical domain decision recorded according to `DOMAIN_SELECTION.md`
- completed name, domain, trademark, privacy, security, license, accessibility, and browser review

Build from a clean checkout:

```bash
corepack enable
pnpm install --frozen-lockfile
PUBLIC_SITE_URL=https://diagrams.example.org \
PUBLIC_INDEX_SITE=true \
PUBLIC_TELEMETRY_MODE=off \
pnpm build:release
pnpm test:metadata
pnpm test:independence
pnpm test:licenses
pnpm sbom
pnpm test:deployment:browser
```

Archive `dist/`, the commit identifier, lockfile, test report, license report, SBOM, and artifact checksum together. Deploy exactly the tested artifact; do not rebuild it inside a provider with different tool versions.

## Preview deployments

Preview and pull-request deployments must:

- use `PUBLIC_INDEX_SITE=false`;
- set `X-Robots-Tag: noindex, nofollow` for all responses at the hosting layer;
- require access control when content or unreleased behavior is sensitive;
- use a preview-specific origin rather than a production canonical domain;
- never reuse production aggregate telemetry storage, ads, credentials, or user data; use
  `PUBLIC_TELEMETRY_MODE=off`.

Meta robots is defense in depth, not a substitute for preview access control. `robots.txt` does not remove a leaked URL from search results.

## Required HTTPS and response policy

The production build injects a hash-aware CSP into each HTML document after Astro emits the artifact. Translate the global response headers and renderer-path policy in [`public/_headers`](../public/_headers) when a host does not support that file. Do not add a second stale script/style CSP response header: review [SECURITY_HEADERS.md](SECURITY_HEADERS.md) and derive any provider-mandated HTTP policy from the exact tested artifact.

At minimum:

- redirect HTTP to HTTPS before public use;
- serve correct MIME types with `X-Content-Type-Options: nosniff`;
- preserve the build-derived CSP and apply the stricter renderer response policy;
- limit referrer and permissions exposure;
- prevent cross-origin framing of the standalone site;
- cache hashed `/_assets/` files immutably;
- revalidate HTML, policies, `robots.txt`, `llms.txt`, and the renderer entry;
- keep the previous immutable artifact available for rollback.

The portable `_headers` example intentionally omits HSTS because it cannot know whether a deployment uses the final HTTPS domain or a temporary preview hostname. After confirming the canonical production host is permanently HTTPS, add `Strict-Transport-Security: max-age=31536000` in that host's production-only response configuration and verify it on the final origin. Keep it off previews and provider-default hostnames. Do not add `includeSubDomains` or preload without auditing every affected subdomain.

## Canonical self-hosted profile

The preferred self-hosted topology is host Caddy on public ports 80/443 proxying to the static container published only at `127.0.0.1:8088`. The Docker image packages the already-tested `dist/`; it does not run Node or rebuild application source. The container translates `_headers`, MIME, cache, health, and real-404 behavior, while Caddy owns public HTTPS, canonical redirects, compression, production HSTS, and health-aware proxying.

Use the pinned artifact-only `Dockerfile`, hardened `compose.yml`, and `ops/caddy/openmermaid.caddy`. Run `pnpm test:deployment:browser` before promotion; CI exercises the same image through a real pinned Caddy edge and Chromium renderer smoke, then generates a separate container SBOM. See [SELF_HOSTING.md](SELF_HOSTING.md) for the complete existing-Caddy and clean-host runbook.

This profile is an implementation of the provider-neutral contract, not a new application runtime. `dist/` remains independently deployable to any compliant HTTPS static host.

The optional aggregate profile uses `compose.telemetry.yml` and
`ops/caddy/openmermaid-telemetry.caddy`. Caddy maps only
`POST /api/telemetry/v1/template-uses` and
`GET /api/telemetry/v1/template-counts` to the loopback collector; `/healthz` remains private.
Review [AGGREGATE_TELEMETRY.md](AGGREGATE_TELEMETRY.md) before enabling it. Static hosts that cannot
provide these same-origin paths must deploy the telemetry-off artifact; the editor does not need a
substitute endpoint.

## Provider notes

### Netlify

Netlify consumes the shipped `_headers` file from the publish directory. The main route gets response-only framing protection while the injected per-page script/style CSP remains authoritative; the renderer gets its explicit response CSP. Configure:

- build command: `pnpm build:release`;
- publish directory: `dist`;
- Node 24 and pinned pnpm;
- release environment variables;
- a separate deploy context rule adding `X-Robots-Tag` for previews.

Verify the deployed headers with `curl -I` because proxy, domain, and branch-deploy settings can override file rules.

### Cloudflare Pages

Cloudflare Pages also supports a `_headers` file. Configure the same build and output settings, then use preview-specific header rules or Access for non-public previews. Review the final response after any caching or transform rule.

### Vercel

Translate each `_headers` rule into the `headers` section of `vercel.json`. Keep the artifact's injected per-page CSP and set immutable asset caching plus the renderer-specific CSP as separate source patterns. Use a preview environment variable and preview response header for noindex. Do not add a serverless function merely to serve this static application.

### Object storage plus CDN

Upload the artifact with correct `Content-Type` and cache metadata. Configure CDN response-header policies for global and renderer paths, custom error mapping to the built 404 page, HTTPS redirect, compression, and cache invalidation. Do not make the storage bucket publicly writable.

### GitHub Pages

GitHub Pages does not provide the required per-path security headers directly. A public security-reviewed release should use a host that supports the policy or put an audited CDN/reverse proxy with those headers in front of Pages.

## Custom 404

Astro emits `dist/404.html` as its special error document. Configure the host to serve that document with HTTP status 404 for unmatched paths. Do not rewrite every missing URL to HTTP 200.

## Post-deployment verification

From a fresh browser profile and command-line client, verify:

1. canonical, Open Graph, robots, JSON-LD, sitemap, and `llms.txt` use the production origin and truthful content;
2. unmatched paths return the real 404 page with status 404 and noindex;
3. HTTP redirects to HTTPS, build-derived CSP meta tags, and global/renderer response headers match policy without a stale duplicate CSP;
4. public pages contain no Mermaid or CodeMirror chunk;
5. editor assets load without a runtime CDN or third-party request;
6. create/edit/reload/share/import/export workflows work in supported browser engines;
7. malicious corpus produces no unexpected request, navigation, dialog, or execution;
8. accessibility, bundle, Lighthouse, and internal-link gates pass against the deployed origin;
9. no service worker is registered and no offline claim appears;
10. logs contain no repeated CSP, MIME, missing-asset, 404, or renderer failure warnings;
11. the performance page reports current-visit metrics without an outbound performance telemetry
    request, and the optional CrUX workflow targets the exact canonical origin;
12. in telemetry-off mode, `/editor/` and `/templates/` make no telemetry request and retain
    `connect-src 'none'`; in aggregate mode, opt-in, opt-out, retry, exact payload, coarsened count,
    and collector-failure behavior pass without exposing diagram data.

## Rollback

Keep at least the prior known-good immutable artifact and its deployment configuration. If a release fails a security, data-integrity, browser, or availability gate:

1. stop promotion and disable indexing for a preview-only failure;
2. restore the exact previous artifact and header configuration;
3. purge or version only the affected HTML/entry caches—hashed assets can remain immutable;
4. verify health, headers, editor persistence compatibility, and console/network logs;
5. document the incident and add a regression check before republishing.

A rollback must not run a persistence downgrade that silently rewrites future document schemas. Unknown schemas fail closed and remain recoverable as source/export data.
