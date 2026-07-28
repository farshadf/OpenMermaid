# Security headers

The repository ships a `_headers` example suitable for Netlify and Cloudflare Pages. Other providers must translate the global framing/defense headers and renderer-path policy without changing the security model.

## Build-derived main application CSP

After Astro builds the static site, `scripts/inject-csp.mjs` adds a Content Security Policy meta tag to each HTML document. It calculates SHA-256 hashes for the exact inline scripts in that artifact, including page-specific structured data and the editor hydration bootstrap. The default `PUBLIC_TELEMETRY_MODE=off` artifact uses this baseline plus generated hashes:

```text
default-src 'none'; script-src 'self' <build hashes>; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'none'; connect-src 'none'; frame-src 'self'; worker-src 'none'; media-src 'none'; object-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'
```

The main `public/_headers` rule adds only the response-only `frame-ancestors 'self'` directive. It deliberately does **not** add a second script or style policy. Browsers enforce multiple policies by intersection; a stale response policy without the current hashes can block valid page scripts without making the generated artifact meaningfully safer. If a provider requires the complete CSP as an HTTP header, derive it from the exact tested `dist/` artifact for every HTML response. Do not maintain a handwritten duplicate `script-src` hash list.

The remaining main response headers are:

```text
Referrer-Policy: no-referrer
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), fullscreen=(self), clipboard-write=(self)
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

Why each CSP allowance exists:

- `script-src 'self'` plus generated hashes permits built modules and the exact trusted inline blocks;
  it does not permit eval, arbitrary inline JavaScript, a runtime CDN, third-party analytics, ads,
  or remote application code.
- `script-src-attr 'none'` blocks inline event handlers even though trusted inline script elements have exact hashes.
- The style directives permit extracted CSS, CodeMirror's deterministic runtime style element, the resizable-pane style property, and inline Mermaid styles inside the isolated preview. Scripts remain hash-restricted. Remote styles and font CDNs remain blocked.
- `img-src 'self' data: blob:` supports repository assets and local generated preview/export URLs.
- In the default artifact, `connect-src 'none'` prevents fetch/XHR/WebSocket destinations; static
  modules and navigation are governed separately.
- `frame-src 'self'` permits the application-owned renderer only.
- workers, media, plugins, injected base URLs, and cross-origin forms are not needed.
- The response-only `frame-ancestors 'self'` directive and `X-Frame-Options` prevent third-party framing. CSP meta tags cannot enforce `frame-ancestors`. A future ChatGPT widget is a separate deployment with its own reviewed framing policy.

### Optional aggregate telemetry policy

An explicit `PUBLIC_TELEMETRY_MODE=aggregate` build changes `connect-src` to `'self'` only on
`/editor/` and `/templates/`, the two routes that can report a template application or load the
public coarsened count snapshot. Every other route retains `connect-src 'none'`, and the renderer
always retains `connect-src 'none'`.

`'self'` is intentionally narrower than an operator-configured URL list: Caddy exposes the
collector through exact same-origin paths, so the browser policy never authorizes a third-party
analytics origin. This mode is a distinct release artifact and must pass both the aggregate-mode
network contract and the ordinary malicious-input tests. Do not relax `connect-src` globally or
add a wildcard to accommodate the collector.

### Agency advertising policy

`PUBLIC_AD_MODE=agency` changes policy only on eligible guide and template detail pages that contain
the reviewed `content-stripe`. Those pages omit the local Web Vitals bootstrap and use a
build-hashed origin gate with `strict-dynamic` to load the approved Google AdSense tag. The
page-specific policy includes Google's
[documented CSP fallback](https://support.google.com/adsense/answer/16283098) of `unsafe-inline` and permits
`unsafe-eval` plus HTTPS provider scripts, connections, frames, images, fonts, workers, and media.
In modern CSP implementations, the build hash and `strict-dynamic` remain the trust root;
`unsafe-inline` is present for provider compatibility and legacy fallback. Google warns that a more
restrictive policy may disrupt serving.

This broader policy is acceptable only with the deployment's hostname boundary:

- public content and agency code run on `PUBLIC_SITE_URL`;
- editor storage and the renderer run on the distinct `PUBLIC_EDITOR_ORIGIN`;
- Caddy prevents editor/renderer routes on the public host and public content on the editor host;
- cookies remain host-only.

Ad-off and placeholder builds retain the baseline policy and make no provider request. Never apply
the agency policy globally, to `/editor/`, or to `/renderer/`. The build contract scans every HTML
route and the advertising manifest records the exact inventory. Review current provider CSP
guidance and captured nested origins before each activation because agency dependencies can change
independently of this repository.

## Renderer policy

```text
Content-Security-Policy: frame-ancestors 'self'
Referrer-Policy: no-referrer
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
X-Content-Type-Options: nosniff
```

The renderer's build-injected meta policy permits one exact hash-authorized inline bootstrap. Its `strict-dynamic` trust loads the local classic runtime without relying on `'self'`, which has inconsistent behavior for deliberately opaque sandbox origins. No arbitrary inline or parser-inserted script is authorized. Inline diagram styles and data/blob images remain available for Mermaid output, while connections, child frames, forms, base URLs, fonts/plugins, workers, and media are blocked. The iframe sandbox omits `allow-same-origin`, navigation, forms, popups, modals, and downloads as a separate containment layer. The response policy supplies the response-only `frame-ancestors 'self'` restriction without intersecting the build-derived script hashes. `renderer/runtime.js` must revalidate because its filename is stable.

## Structured data and CSP

Public pages include non-executable `<script type="application/ld+json">` structured data. The post-build injector incorporates each exact inline block into the build-derived CSP. Validate the final output in all target browsers and check the security console during release testing. Never add `'unsafe-inline'` to `script-src` to silence a hash or deployment mismatch.

## HSTS

HSTS has durable domain-wide effects, so the portable `public/_headers` example intentionally omits it. After the production host is permanently HTTPS, add `Strict-Transport-Security: max-age=31536000` in that host's production-only response configuration. Keep it off preview and provider-default hostnames. Add `includeSubDomains` only after auditing every subdomain; add `preload` only through a separate operational and domain-ownership review.

## Docker and host Caddy ownership

The self-hosted static server translates the exact main and renderer response rules into `ops/docker/main-security-headers.conf` and `ops/docker/renderer-security-headers.conf`. Those files must change with `public/_headers`; `pnpm test:deployment` asserts the important route-specific behavior through both Nginx and Caddy.

Host Caddy deliberately adds only production HSTS and passes the inner response policy through. It must not carry a handwritten copy of the build-derived script/style CSP or duplicate the response-only framing policy. Caddy owns dynamic compression so the inner server does not pre-compress a representation and prevent correct zstd/gzip negotiation at the public edge.

The renderer response intentionally omits main-application-only `X-Frame-Options`, COOP, and CORP. In particular, applying main CORP to the deliberately opaque sandbox origin can stop its application-owned classic runtime from loading. Preserve the narrower renderer matcher when translating this policy to any other reverse proxy.

The supplied Caddy site block is production-only. A preview must use a separate site configuration with no HSTS and with `X-Robots-Tag: noindex, nofollow` on every response.

## Preview noindex

Add this header to every preview response in addition to build-time noindex metadata:

```text
X-Robots-Tag: noindex, nofollow
```

Do not add that header to a production release intended for indexing.

## Verification

Verify headers on `/`, `/editor/`, `/renderer/`, a hashed asset, a guide, a template, `robots.txt`, and a 404 response. Test both the provider’s default hostname and custom domain because edge rules can differ.

```bash
curl -sSI https://example.org/
curl -sSI https://example.org/editor/
curl -sSI https://example.org/renderer/
curl -sSI https://example.org/not-a-real-page
```

Then run the malicious-input and Playwright network assertions in a fresh browser context. A header that looks correct in `curl` is not sufficient proof that the rendered application makes no unexpected request or execution.
