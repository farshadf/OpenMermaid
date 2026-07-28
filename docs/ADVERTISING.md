# Agency advertising architecture

**Status:** Implemented behind an explicit release switch; default build remains `off`

**Policy version:** 2026-07-28

Open Mermaid supports advertising supplied and measured by approved external agencies. There is no
direct-sponsor or first-party creative mode. Google AdSense is the first concrete web adapter;
additional agencies require a separate adapter, data-flow review, CSP review, and release decision.

The privacy objective is not zero agency processing, which would be incompatible with agency
measurement. It is to let the agency measure eligible advertising traffic while making local
diagram data technically unavailable to its code.

## Non-negotiable boundary

Agency code and editor storage must use different hostnames:

```text
https://openmermaid.<tld>
  public pages, guides, templates, CMP, approved agency tag
  no editor IndexedDB or diagram-bearing routes

https://app.openmermaid.<tld>
  editor, renderer, local documents, fragment shares
  no agency markup, script, request, CMP, or advertising manifest

agency dashboard/reporting API
  authoritative aggregate advertising and revenue reports
  credentials remain server-side and outside the browser build
```

Running agency JavaScript on a public route of the same origin as the editor is not acceptable:
third-party JavaScript executes with that page origin's authority and could access same-origin DOM,
local storage, and IndexedDB. Route separation alone is not a privacy boundary.

Required deployment rules:

- `PUBLIC_SITE_URL` and `PUBLIC_EDITOR_ORIGIN` use distinct HTTPS hostnames.
- Caddy redirects `/editor/` on the public hostname to the editor hostname.
- Caddy returns 404 for `/renderer/` on the public hostname.
- The editor hostname serves only `/editor/`, `/renderer/`, required local assets, health, and an
  explicitly configured first-party telemetry endpoint.
- Cookies are host-only. Do not set a cookie with `Domain=.openmermaid.<tld>`.
- Public advertising URLs contain no diagram source, document ID, fragment share, editor search,
  import/export state, or product-telemetry identifier.

## Supported modes

```ts
type AdMode = 'off' | 'placeholder' | 'agency';
type AdProvider = 'google-adsense';
type AdPlacement = 'content-stripe';
type AdRouteKind = 'guide-detail' | 'template-detail';
```

### `off`

The default. It emits no placement markup, reserved space, advertising CSS, provider bootstrap,
provider request, advertising manifest, or advertising CSP relaxation.

### `placeholder`

A noindexed development/preview mode. It renders one inert striped placement using the production
dimensions. It contains no agency identifier, provider code, remote request, link, or measurement.
An indexed placeholder build fails.

### `agency`

An indexed release mode using an approved provider account and ad unit. It emits:

- one content stripe on each eligible detail route;
- an origin-gated local bootstrap that loads the unchanged provider tag only on
  `PUBLIC_SITE_URL`;
- a provider-compatible CSP only on pages carrying agency inventory;
- a deterministic advertising manifest with placement inventory, policy version, provider origins,
  isolated public/editor origins, and a hash of the public account/ad-unit tuple;
- no agency bytes on the editor, renderer, homepage, indexes, privacy, security, about,
  performance, or 404 routes.

Agency mode fails unless the site is explicitly indexed, the provider and identifiers validate,
and the editor hostname differs from the public hostname.

## Initial inventory

Only one placement is implemented:

- **Placement:** `content-stripe`
- **Routes:** `/guides/<slug>/` and `/templates/<slug>/`
- **Count:** at most one per page
- **Label:** visible `Advertisement`
- **Behavior:** non-sticky, no expansion, no application-controlled refresh
- **Desktop box:** responsive width, 90 CSS px high
- **Compact box:** responsive width, 100 CSS px high
- **Location:** after substantive publisher content and separated from editor/template action
  controls
- **Excluded:** homepage, catalogue/index pages, editor, renderer, fragment shares, exports, print,
  dialogs, navigation, and mobile overlays

Auto-placement products, anchors, vignettes, popups, interstitials, autoplay media, rewarded ads,
sticky formats, and advertising inside the editor are not supported.

## Measurement and consent contract

The agency is authoritative for:

- ad requests and fill;
- downloaded and viewable impressions;
- clicks and click-through rate;
- invalid-traffic adjustments;
- CPC, CPM, RPM, and finalized revenue;
- the provider's consent and restricted-serving status.

Full measurement inherently allows the approved provider to process the minimum signals required
to serve and protect its inventory, including public page context, publisher/ad-unit identifiers,
IP address, browser/device request information, consent signals, render/viewability events, clicks,
and fraud-prevention signals.

Open Mermaid does not create a parallel impression or click tracker. If internal reporting is
needed, a separate server-side job may retrieve daily aggregate provider reports. Reporting API
credentials never enter the static build. Imported reports must not contain or be joined to local
document data, Open Mermaid product-telemetry event IDs, or stable Open Mermaid user identifiers.

Google Privacy & Messaging is the initial consent strategy. The account configuration and public
privacy notice must match the behavior that actually ships. Limited or non-personalized ads are not
described as anonymous: provider JavaScript, IP-based delivery, and fraud-prevention technology may
still operate. Consent denial, browser restrictions, or ad blocking can reduce measurement; Open
Mermaid does not bypass those choices.

## Data prohibition

Agency code must never receive from Open Mermaid:

- Mermaid source or rendered/sanitized SVG;
- document title, ID, filename, revision, or local timestamps;
- fragment-share envelopes, editor query parameters, or import contents;
- editor search, cursor, CodeMirror, render-error, preview viewport, clipboard, copy, export, or
  file-selection data;
- IndexedDB, local/session storage, performance-history, or theme history from the editor origin;
- aggregate-template-telemetry event IDs or preference state;
- ChatGPT, AI, account, cloud-sync, or collaboration data;
- a custom user ID, hashed email, first-party advertising audience, or cross-product identity.

The enforced hostname split, route allowlist, absence of a cross-origin message bridge, host-only
cookie policy, and browser request-capture tests protect this boundary.

## Google AdSense adapter

The first adapter uses a manually positioned horizontal AdSense unit. Open Mermaid does not use
Auto ads or a tag manager. The provider bootstrap:

1. finds the typed `google-adsense` placement;
2. compares `location.origin` with the build-time public origin;
3. validates the public publisher ID shape;
4. creates the official asynchronous AdSense loader;
5. queues the reviewed ad unit once;
6. retains the reserved box on loader failure.

Do not place AdSense inside an application-created iframe. Google's publisher policy does not
permit that integration, and cross-domain frames can interfere with provider viewability
measurement. Provider-created frames remain governed by the provider.

Provider code is never executed during local preview because the preview origin cannot equal the
configured production HTTPS origin. Operators must not click production inventory during QA.

## CSP and supply-chain posture

Ad-off, placeholder, editor, renderer, and non-inventory pages retain the existing restrictive CSP.
Only an agency inventory page receives the provider-compatible policy.

Google's [AdSense CSP guidance](https://support.google.com/adsense/answer/16283098) documents a
`strict-dynamic` policy with a trusted nonce plus `unsafe-inline`, `unsafe-eval`, and dynamic
HTTPS/HTTP script loading. Open Mermaid uses a build hash instead of a runtime nonce:
the small origin gate is the modern-browser trust root and `strict-dynamic` delegates provider
descendants. The `unsafe-inline` token is retained as Google's compatibility fallback; it is
ignored as an unrestricted source by modern CSP implementations when the hash-based strict policy
is active. Agency pages also permit the HTTPS connections, frames, images, fonts, workers, and
media needed for the provider. This broader policy is isolated to the public content hostname,
which stores no local documents.

The selected provider can change nested origins over time. Before every activation or provider
change:

- run the agency build in CSP report-only staging where available;
- capture all requests, frames, storage, cookies, console messages, and navigation;
- compare them with the approved vendor/data inventory;
- reject unexplained vendors or data fields;
- verify the provider's current CSP, consent, and placement documentation.

## Configuration

Ad-off build:

```dotenv
PUBLIC_AD_MODE=off
```

Noindexed layout preview:

```dotenv
PUBLIC_INDEX_SITE=false
PUBLIC_AD_MODE=placeholder
```

Agency release:

```dotenv
PUBLIC_SITE_URL=https://openmermaid.example
PUBLIC_EDITOR_ORIGIN=https://app.openmermaid.example
PUBLIC_INDEX_SITE=true
PUBLIC_AD_MODE=agency
PUBLIC_AD_PROVIDER=google-adsense
PUBLIC_ADSENSE_CLIENT=ca-pub-0000000000000000
PUBLIC_ADSENSE_SLOT=0000000000
```

Example IDs are invalid operational placeholders. Never publish them in `/ads.txt` or a production
artifact.

The Caddy host environment additionally requires:

```dotenv
OPEN_MERMAID_SITE=openmermaid.example
OPEN_MERMAID_EDITOR_SITE=app.openmermaid.example
OPEN_MERMAID_EDITOR_ORIGIN=https://app.openmermaid.example
OPEN_MERMAID_UPSTREAM=127.0.0.1:8088
```

## Build and release gates

`scripts/check-advertising-build.mjs` verifies:

- off builds contain no advertising bytes or manifest;
- placeholders are inert, noindexed, and limited to eligible routes;
- agency builds have exactly one placement per eligible detail page;
- provider code never appears on an ineligible route or editor artifact;
- production pages contain no development placeholder;
- the local bootstrap is origin-gated and the provider is not statically loaded;
- the agency CSP is confined to inventory pages;
- the advertising manifest matches every built route;
- public and editor origins differ.

Additional required evidence:

- unit tests for every config mode, malformed ID, unknown provider, and shared hostname;
- Chromium, Firefox, and WebKit layout/accessibility tests;
- 320 px, tablet, desktop, 400% zoom, forced-colors, and reduced-motion review;
- no overlap with content links or template/editor actions;
- zero unexpected advertising-attributed layout shift;
- request capture proving no diagram canary reaches the provider;
- consent pending, accepted, rejected, withdrawn, limited, blocked, no-fill, and outage cases;
- unchanged editor performance and CSP;
- an agency-enabled Lighthouse/Web Vitals cohort separate from the ad-free cohort;
- `/ads.txt` containing only real seller records supplied by the active agency.

## Performance budgets

Existing p75 objectives remain LCP ≤2.5 s, INP ≤200 ms, and CLS ≤0.1. Agency pages are measured as
a separate cohort and may not reduce existing release floors.

- one placement per page;
- no application-controlled refresh;
- zero ad JavaScript on the editor;
- zero provider request on ineligible routes or the wrong hostname;
- dimensions reserved in initial HTML/CSS;
- no preconnect or provider preload;
- no application critical-path dependency on successful fill;
- no collapse after a live placement has affected layout;
- no provider failure may block public content or editor navigation.

## Operations and shutdown

Three controls are independent:

1. `PUBLIC_AD_MODE=off` produces a byte-clean immutable artifact.
2. The build-time route allowlist controls inventory.
3. Caddy can block the public agency origin while the last verified ad-free image is deployed.

For a provider, consent, privacy, security, performance, or policy incident:

1. deploy the last verified ad-off image by immutable digest;
2. confirm provider requests stop on public detail pages;
3. leave the editor hostname and local documents untouched;
4. preserve aggregate provider reports and configuration evidence required for investigation;
5. reactivate only after privacy, security, product, and operations approve a new artifact.

## Activation checklist

Agency advertising is not ready to activate until all items are true:

- canonical public and editor hostnames are selected and covered by HTTPS;
- name/domain clearance and operator/contact details are complete;
- the agency account and site are approved;
- real publisher/ad-unit IDs are supplied through the release environment;
- Google Privacy & Messaging or another approved certified CMP is configured for launch regions;
- privacy text, vendor inventory, retention, withdrawal, and restricted-serving behavior match the
  account;
- public/editor Caddy route isolation is verified from outside the host;
- current provider policy confirms the exact integration;
- `/ads.txt` contains the agency-provided seller record;
- ad-off, placeholder, and agency artifact contracts pass;
- request-capture, accessibility, WebKit, CSP, consent, performance, and rollback evidence is
  approved;
- operators understand that production ads must never be clicked for testing.
