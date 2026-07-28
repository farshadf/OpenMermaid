# Advertising implementation plan

**Status:** Proposed; no advertising is active in the current build

**Owner:** Product, privacy, security, performance, and operations

**Last reviewed:** 2026-07-26

This plan turns the existing disabled `banner`, `content-rail`, and `editor-rail` boundaries into an
implementation path without weakening Open Mermaid's standalone editor, diagram-data boundary, or
performance targets. Advertising is an optional delivery configuration, not a dependency of the
editor or shared core.

The recommended first release is **one first-party, direct-sponsor content stripe on eligible
public guide and template pages**. It is a fixed-size, non-sticky, static image-and-link placement
rendered at build time. It uses no provider JavaScript, tracking pixel, cookie, local storage,
fingerprinting, personalization, or client-side auction. Do not place ads in the editor in the
first advertising release.

This recommendation is deliberately narrower than installing a general ad network:

- public guides and templates provide substantive publisher-authored content and natural
  separation from editor controls;
- a content stripe has a predictable responsive box, low accidental-click risk, and no
  main-thread JavaScript cost;
- direct creative can preserve the current `connect-src 'none'` policy and static-host
  architecture;
- it avoids exposing a page URL, diagram source, or user behavior to an ad provider;
- it establishes slot, policy, release, and measurement machinery before accepting third-party
  code.

## Goals and non-goals

### Goals

- Create a useful, clearly labeled advertising surface without obstructing content or controls.
- Keep the editor fully functional when ads are disabled, blocked, rejected, unavailable, or
  removed.
- Make the default and failure states deterministic: no shifting controls, surprise overlays, or
  delayed page reflow.
- Keep diagram data, local identifiers, URL fragments, and editor activity outside the ad system.
- Preserve WCAG 2.2 AA targets and the existing Core Web Vitals objectives.
- Make every provider origin, data field, permission, and storage behavior reviewable before
  release.
- Support an immediate operational shutdown and a clean ad-free build.

### Non-goals

- No pop-ups, pop-unders, prestitials, postitials, interstitials, scrollovers, sticky mobile units,
  auto-playing media, audio, flashing creative, or ads inside preview/export output.
- No behavioral targeting from diagram content, document metadata, template selection, search
  input, URL fragments, editor events, clipboard activity, or local documents.
- No ad refresh while a user is editing, no background impression generation, and no rewarded
  interaction.
- No ad-provider package in `src/lib/documents`, `src/lib/rendering`, `src/lib/share`,
  `src/lib/storage`, or another shared-core module.
- No user-level advertising analytics, cross-site identity, session replay, or advertising
  experiment hidden inside performance diagnostics.

## Policy baseline

Provider terms and applicable law require a launch-specific review. The following current primary
guidance is the minimum product baseline, not a substitute for legal advice:

- [Google Publisher Policies](https://support.google.com/publisherpolicies/answer/10502938) prohibit
  ads that interfere with content or action items, ads on low-value/non-content screens, and pages
  with more paid promotion than publisher content. They also require conformance with the Better
  Ads Standards.
- [Google AdSense placement policies](https://support.google.com/adsense/answer/1346295) warn
  against accidental clicks, ads near navigation/download/application controls, misleading labels,
  and styling that disguises ads as content.
- The current
  [Coalition for Better Ads standards](https://www.betterads.org/standards/) reject pop-ups,
  auto-playing video with sound, countdown prestitials, large sticky ads, and excessive density.
  The 2026 update also covers desktop ad density above 50%, desktop density above 30% combined with
  sticky video, sticky pop-out video on mobile, and sticky video combined with a large inline ad.
  Open Mermaid will use the stricter internal rules in this document even where a format might fall
  below a formal threshold.
- Google's
  [consent-management requirements](https://support.google.com/admanager/answer/13554116) require
  publishers using Google publisher products for EEA, UK, and Swiss traffic to use a
  Google-certified CMP integrated with the IAB Transparency and Consent Framework for personalized
  ads. Non-personalized or limited ads are not assumed to eliminate every disclosure, consent, or
  storage obligation.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) remains the accessibility target for the whole delivered
  page, including advertising creative.
- Web.dev identifies third-party JavaScript as a privacy, security, network, and main-thread risk
  and recommends explicit budgets in
  [Third-party JavaScript performance](https://web.dev/articles/third-party-javascript). Its
  [CLS guidance](https://web.dev/articles/optimize-cls) recommends reserving dimensions for
  late-loading ads.

Before choosing a provider, obtain a written answer about whether its terms permit the proposed
isolation model. In particular, do not assume Google AdSense or Google Publisher Tag can be placed
inside an application-created, separate-origin iframe. Google's own
[AdSense policy FAQ](https://support.google.com/adsense/answer/3394713) says placing ads on framed
pages is not permitted, while Google SafeFrame normally requires publisher code in the parent page.
If a provider requires parent-origin script execution, page-level targeting, the full page URL, or
access incompatible with this plan, reject that provider or approve a new architecture decision;
do not silently weaken the boundary.

## Placement decision

| Candidate                  | User impact                                  | Privacy/security                                              | Performance/CLS                          | Revenue potential | Decision                   |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- | ----------------- | -------------------------- |
| Public content stripe      | Low when placed between substantive sections | Best with first-party direct creative                         | Fixed responsive box; no JS in phase 1   | Moderate          | **Launch first**           |
| Public right content rail  | Good only on wide article layouts            | Compatible with direct creative or reviewed isolated provider | Stable, but reduces reading width        | Moderate          | Phase 2 experiment         |
| Site-wide top banner       | Competes with navigation and LCP content     | Same provider risks                                           | Can delay or push first content          | Moderate          | Do not launch              |
| Editor right rail          | Useful only on very wide screens             | Highest sensitivity and accidental-click risk                 | Stable only with a new fixed grid column | Potentially high  | Phase 4, separate approval |
| Sticky stripe/anchor ad    | Persistent obstruction                       | Increased tracking/viewability pressure                       | High interaction and viewport risk       | High              | Prohibited                 |
| Overlay/interstitial/video | Interrupts authoring and reading             | Broad permissions and data pressure                           | Main-thread, media, and CLS risk         | Variable          | Prohibited                 |

### Recommended phase-1 content stripe

- Eligible routes: substantive `/guides/<slug>/` and `/templates/<slug>/` pages only.
- Inventory: at most one stripe per page.
- Location: after the page introduction and first substantive explanation/example, before related
  links. It must not sit immediately beside copy/download/export/navigation controls.
- Label: visible text `Advertisement` outside the linked creative. Do not use labels such as
  “Resources,” “Recommended,” or “Support us.”
- Behavior: non-sticky, no animation, no audio/video, no auto-refresh, no expansion, and no
  controls that resemble Open Mermaid buttons.
- Desktop reserved creative box: `min(60.625rem, 100%) × 5.625rem` with a centered creative area,
  supporting a 970×90 or 728×90 source.
- Compact reserved creative box: `100% × 6.25rem`, supporting a 320×100 or 300×100 source without
  cropping.
- Outer slot includes the visible label and at least 1rem block padding between the creative and
  adjacent interactive content. Its exact label, padding, and creative dimensions are present in
  initial HTML/CSS.
- Direct links use HTTPS and `rel="sponsored nofollow noopener noreferrer"`. The creative has a
  useful accessible name and does not rely on an image filename or advertiser logo alone.
- If there is no active creative, the slot does not render. In an ad-enabled page where a requested
  creative fails after first paint, retain the reserved box or replace it with a non-clickable
  neutral house panel for that navigation; do not collapse and shift the page.

The repository's existing disabled `content-rail` primitive can be migrated to a more accurately
named `content-stripe` placement while retaining an alias during the transition. The disabled
`banner` remains unrendered.

### Development placeholder

The phase-1 placeholder previews layout, not advertising:

- use the same reserved dimensions and responsive rules as the real placement;
- render a non-interactive `Advertisement preview` label and a subtle, motionless diagonal-stripe
  pattern derived from existing surface/border tokens;
- use a dashed boundary and neutral text so it cannot be mistaken for an advertiser, application
  control, warning, or empty loading state;
- include placement ID and dimensions only in noindexed development/staging builds;
- do not make it focusable, clickable, remotely configurable, or visible to production users;
- fail an indexed release if placeholder text, attributes, or styles appear in `dist/`.

### Future public content rail

A public rail may be evaluated after stripe data exists:

- only at a container width that leaves the article measure unchanged and at least 2rem separation
  between article content and the rail;
- one fixed 160×600 creative, never sticky and never taller than the main content;
- absent below the selected wide breakpoint rather than moved into mobile content;
- not combined with the content stripe until density and user-impact review explicitly approves
  two placements.

### Future editor rail

The editor rail requires its own release decision. Minimum layout rules are:

- available only at `min-width: 100rem` (1600 CSS px) and `min-height: 50rem` (800 CSS px);
- one fixed 160×600 slot in a dedicated `app-main` grid column, outside the document library,
  source pane, preview pane, header, dialogs, and toast region;
- at least 1rem separation from the closest editor surface and a visible `Advertisement` label;
- hidden before the initial layout calculation on smaller viewports—never moved above, below, or
  inside the editor on mobile;
- source and preview retain their tested minimum widths; the slot disappears rather than shrinking
  either authoring pane below those widths;
- the rail is not sticky over the editor, does not expand, and does not refresh during the page
  session;
- fullscreen preview excludes the rail;
- export, screenshots produced by the application, copy, and print output exclude the rail;
- no ad request is made while the rail is CSS-hidden or consent-ineligible.

If no-fill or failure occurs after the rail was reserved, keep the column stable for that page
session. The next navigation may start ad-free. Never collapse a live rail in a way that resizes the
editor or moves controls under a pointer.

## Configuration and contracts

Advertising must be fail-closed and build-explicit. Suggested contracts:

```ts
type AdMode = 'off' | 'placeholder' | 'direct' | 'network';
type AdPlacement = 'content-stripe' | 'content-rail' | 'editor-rail';
type AdRouteKind = 'guide-detail' | 'template-detail' | 'home' | 'editor';

interface AdPlacementDefinitionV1 {
  schemaVersion: 1;
  placement: AdPlacement;
  allowedRouteKinds: readonly AdRouteKind[];
  reservedWidth: number;
  reservedHeight: number;
  minViewportWidth?: number;
  minViewportHeight?: number;
  label: 'Advertisement';
  refresh: false;
}

interface DirectSponsorCreativeV1 {
  schemaVersion: 1;
  id: string;
  placement: 'content-stripe' | 'content-rail';
  imagePath: `/${string}`;
  imageWidth: number;
  imageHeight: number;
  accessibleName: string;
  destination: `https://${string}`;
  startsAt: string;
  endsAt: string;
}

interface AdvertisingBuildConfigV1 {
  schemaVersion: 1;
  mode: AdMode;
  placements: readonly AdPlacement[];
  provider?: string;
  adOrigin?: `https://${string}`;
}
```

Validation rules:

- `off` is the default when configuration is absent, malformed, expired, or unsupported.
- `placeholder` is allowed only in development, tests, and noindexed preview deployments.
- `direct` accepts repository-owned image assets and data fields only—never arbitrary HTML,
  JavaScript, CSS, SVG markup, redirects, `data:` URLs, or protocol-relative URLs.
- A creative ID is campaign-scoped, not user-scoped. It is never written to local browser storage.
- Dates use UTC ISO 8601 and are enforced at build time. An expired or not-yet-active creative is
  omitted before HTML generation.
- Destination hosts use an explicit build-time allowlist. Redirect chains are reviewed before
  launch.
- Network mode cannot be enabled by a public query, fragment, cookie, local-storage key, or
  user-authored content.
- Every `placeholder`, `direct`, or `network` build emits an auditable advertising manifest with
  mode, placement IDs, creative hashes, provider/origin allowlists, and policy version, but no
  secret or user data. An `off` build emits no advertising manifest.

Suggested module direction:

```text
typed campaign data ---> static AdSlot component ---> eligible public pages
                                  |
                           advertising manifest

future network adapter ---> ad-origin wrapper

shared document/render/share/storage core -X-> advertising modules
renderer iframe                         -X-> advertising modules
```

Suggested implementation seams:

- `src/lib/advertising/contracts.ts`: types and pure validation only;
- `src/data/advertising.ts`: build-time direct campaign catalog;
- `src/components/advertising/AdSlot.astro`: slot semantics and direct creative rendering;
- `src/styles/advertising.css`: reserved dimensions and responsive visibility;
- `scripts/check-advertising-build.mjs`: mode, route, CSP, link, density, and manifest checks;
- a dedicated, separately deployed ad-origin project only if network mode passes feasibility review.

Do not put a provider SDK or campaign catalog in the editor bundle. Static routes not eligible for
ads must not receive advertising markup, styles, scripts, preconnects, or provider requests.

## Data and privacy boundary

### Data an ad must never receive

- Mermaid source or sanitized SVG;
- document title, filename, local document ID, timestamps, or revision;
- URL fragment, share envelope, query string, or raw editor pathname;
- editor search, template choice, import/export/copy/share actions;
- render status, error details, cursor position, CodeMirror state, or preview viewport;
- IndexedDB/local-storage values, local performance records, theme preference history;
- clipboard, file, device sensor, geolocation, camera, microphone, payment, or USB access;
- ChatGPT, AI, future account, or cloud-sync data.

### Permitted phase-1 data

Direct phase-1 creative is generated into static HTML and makes no impression or tracking request.
The hosting layer receives only the ordinary page and first-party asset requests already described
in the privacy notice. A user who follows the sponsor link intentionally navigates to the
advertiser; the global `Referrer-Policy: no-referrer` and link-level `noreferrer` prevent Open
Mermaid page information from being sent as a referrer.

If direct-sponsor reporting is commercially required, prefer bounded aggregate server counts for a
dedicated first-party redirect endpoint only after a separate privacy review. The endpoint must not
accept arbitrary destinations, diagram data, URL/referrer data, or stable user identifiers. It is
not part of phase 1.

### Consent gate for future network mode

Before loading a CMP or provider:

1. Inventory every company and origin involved, including nested auctions, verification, creative,
   click, measurement, and consent vendors.
2. Document every cookie, storage key, identifier, fingerprinting behavior, IP use, purpose,
   retention period, onward transfer, sale/share classification, and opt-out path.
3. Complete legal review for launch regions, age/child-directed-content posture, Global Privacy
   Control handling, and sensitive-data rules.
4. Select a CMP compatible with provider terms. If Google publisher products are used for EEA, UK,
   or Swiss users, use the currently required Google-certified TCF CMP.
5. Default non-essential purposes to denied. Do not construct the provider iframe, preconnect to
   provider origins, or make an ad request until the applicable decision permits it.
6. Make Reject as easy to find and operate as Accept where required, provide granular choices, and
   expose a persistent “Privacy choices” entry.
7. Keep the editor available when consent is rejected. Consent is never a condition for opening,
   editing, saving, sharing, or exporting a diagram.
8. Test withdrawal: new requests stop after the preference changes, provider state is cleared where
   required, and the current editor state is not lost.

“Contextual,” “non-personalized,” and “limited” ads are provider modes, not automatic legal
exemptions. The approved privacy notice must describe the configuration that actually ships.

## Isolated network-ad architecture

Network mode is deferred until a provider confirms compatibility. If approved, use:

```text
Open Mermaid page
  |
  | fixed src; referrerpolicy="no-referrer"
  v
sandboxed iframe at dedicated ad origin
  |
  | provider-specific, CSP-allowlisted requests after consent
  v
reviewed provider and creative delivery
```

Parent-page requirements:

- iframe `src` is a fixed placement URL constructed from constants, never `location.href`;
- `referrerpolicy="no-referrer"`;
- descriptive `title`, visible external `Advertisement` label, fixed `width`/`height`, and
  `loading="lazy"` for below-the-fold public placements;
- no `allow-same-origin`, top-navigation, forms, downloads, storage-access, presentation, or device
  permissions;
- no provider script, tag manager, auction code, or provider event listener in the Open Mermaid
  parent;
- parent CSP adds only the exact ad origin to `frame-src`; it does not broaden `connect-src`,
  `script-src`, or `img-src` for the provider;
- the ad origin cannot frame the renderer, editor, or another Open Mermaid page.

The current editor boundary prohibits popups and top navigation. Clickable third-party creatives
normally need either a new tab or top-level navigation. `allow-popups-to-escape-sandbox` would let a
new advertiser tab escape the frame sandbox, and `allow-top-navigation-by-user-activation` would
navigate the application. Neither token may be added as an implementation detail. Before shipping
a clickable network creative, security and product must explicitly choose and document one of:

1. a provider-supported SafeFrame/click mechanism whose exact behavior passes the boundary review;
2. a narrowly allowlisted, application-owned click relay driven by a direct user action and not by
   arbitrary `postMessage`; or
3. keeping network ads out of the editor.

Option 3 is the default. A provider that cannot work under it is not compatible with the editor.

Ad-origin requirements:

- separate deployment, origin, release cadence, CSP, logs, incident switch, and threat review;
- HTTPS only; prefer a separate registrable domain when operationally acceptable. If a subdomain is
  used, prove there are no inherited application cookies and no cookie scoped to the parent domain;
- response `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
  `X-Robots-Tag: noindex, nofollow`, restrictive `Permissions-Policy`, and CSP
  `frame-ancestors` limited to the canonical Open Mermaid origin;
- provider CSP allowlists contain exact documented origins—no `*`, broad `https:`, `data:` script,
  `unsafe-eval`, or unreviewed nested frames;
- no Open Mermaid application credential, document database, log correlation ID, source URL, or
  host access;
- no `postMessage` channel unless a versioned protocol and concrete use case are approved. Fixed
  slots do not need dynamic resizing or document context.

The initial iframe navigation can carry cookies even when script runs in an opaque sandbox origin;
therefore sandboxing alone is not a consent or tracking control. Verify actual browser request and
storage behavior with the selected provider.

## Security threat model

| Threat                                       | Required mitigation                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Provider/creative compromise                 | Separate origin and deployment; exact CSP allowlists; sandbox; no parent SDK; kill switch    |
| Diagram or fragment leakage                  | Fixed iframe URL; `no-referrer`; request-capture tests; no parent-to-frame data              |
| Parent DOM/source access                     | Omit `allow-same-origin`; no shared-origin provider code; no generic message bridge          |
| Navigation, popup, download, dialog abuse    | Omit corresponding sandbox tokens; test hostile creative; approve clicks separately          |
| Cookie/storage/fingerprinting before consent | Do not create frame/request before consent; inventory browser storage and requests           |
| Accidental clicks near editor controls       | Public stripe first; fixed separation; editor rail only at wide breakpoint                   |
| Layout-shift click capture                   | Reserve exact dimensions in initial layout; never expand/collapse over a live control        |
| Resource exhaustion or provider outage       | Lazy load eligible public slots, request/render timeout, one slot per page, no refresh       |
| CSP allowlist creep                          | Generated provider-origin manifest, diff gate, security approval for every new origin        |
| Malicious campaign data                      | Typed fields; HTTPS and destination allowlist; local raster assets; no arbitrary markup      |
| Misleading/unsafe creative                   | Human campaign review, provider category blocks, screenshot evidence, complaint/disable path |
| Invalid traffic from tests/operators         | Test ads or placeholder mode only; never click production inventory during QA                |
| Ad blocker/no-fill                           | Core UI remains complete; no retry loop; stable reserved area for current navigation         |
| Consent bypass or stale state                | Denied-by-default tests, versioned consent purpose mapping, withdrawal tests                 |

Provider dashboards, account access, payment settings, publisher IDs, and campaign credentials use
least privilege and multi-factor authentication. No provider credential enters a public build.

## Performance and Core Web Vitals budgets

The existing objectives remain unchanged at p75 for mobile and desktop:

- LCP ≤ 2.5 seconds;
- INP ≤ 200 milliseconds;
- CLS ≤ 0.1.

Ad-enabled routes are a separate measurement cohort and cannot lower the existing Lighthouse floors.
Additional per-page budgets:

| Budget                                      |             Direct stripe |                                              Future network mode |
| ------------------------------------------- | ------------------------: | ---------------------------------------------------------------: |
| Advertising JavaScript in parent            |                       0 B |                                                              0 B |
| Advertising JS execution in parent          |                      0 ms |                                                             0 ms |
| Initial third-party requests before consent |                         0 |                                                                0 |
| Added CLS attributable to ads               |           0.00 lab target |             0.00 lab target; ≤0.02 field investigation threshold |
| Creative transfer                           | ≤40 KiB compressed raster | ≤100 KiB initial creative, provider overhead reported separately |
| Added critical-path requests                |                         0 |                                                                0 |
| Slot count                                  |                         1 |                                                                1 |
| Refreshes per navigation                    |                         0 |                                                                0 |
| Slot timeout                                |            not applicable |                     3 seconds to a stable no-fill/fallback state |

Implementation rules:

- Direct creative uses an optimized repository-owned AVIF/WebP with an explicit width and height;
  keep an accessible fallback format only if browser support requires it.
- Never preload, preconnect, or load ad resources before consent or before an eligible placement is
  close enough to need them.
- Below-the-fold iframes use native lazy loading. If a chosen provider uses GPT, follow its official
  [lazy-loading guidance](https://developers.google.com/publisher-tag/samples/lazy-loading), but do
  not import GPT into the parent merely to gain this feature.
- Slot dimensions are in initial server-rendered CSS. Creative selection cannot change the outer
  block size.
- Do not collapse empty slots after content or editor controls have been laid out. Use an
  ad-free next navigation or a same-size neutral fallback.
- No animation runs when `prefers-reduced-motion: reduce`; phase 1 contains no animation at all.
- Measure provider transfer, request count, long tasks, failures, and console errors in addition to
  Lighthouse and Web Vitals.

Use `/performance/` local diagnostics and CrUX without adding diagram-sensitive ad telemetry. Add a
fixed page-kind dimension such as `public-ad-enabled` only if it cannot reveal a specific page,
campaign, or user and the performance schema/privacy text are reviewed first.

## Accessibility and interaction rules

- The outer element is an `aside` with a visible `Advertisement` label. The label is not supplied
  only through color, position, an icon, or an iframe title.
- A linked direct creative has one concise accessible name that identifies it as an advertisement
  and describes the destination/action. Avoid duplicate focus stops for image and text.
- Keyboard focus is visible and follows document order. The placement never traps focus or
  intercepts editor shortcuts.
- Touch/click targets meet the existing application target size, but the entire surrounding stripe
  is not made clickable merely to increase click area.
- Creative text and controls meet WCAG 2.2 AA contrast and zoom/reflow requirements. Network
  creative that cannot meet the release bar is blocked.
- No flashing, auto-playing audio/video, essential time limit, hover-only disclosure, or animated
  expansion.
- Forced-colors and reduced-motion tests include the label, link, frame boundary, and fallback.
- At 320 CSS px and 400% zoom, ads remain distinct from content and do not create page-wide
  horizontal scrolling.
- Screen-reader testing confirms the label, link purpose, iframe title (if any), and return to
  surrounding content. Ads are not hidden from assistive technology while remaining clickable.

## SEO, disclosure, and inventory integrity

- Advertising text is never added to page title, meta description, Open Graph fields, JSON-LD,
  breadcrumbs, template source, guide body, sitemap priority, or `llms.txt`.
- Sponsor links use `rel="sponsored nofollow"` plus the security relationship values.
- The ad-origin wrapper returns `X-Robots-Tag: noindex, nofollow` and is excluded from the sitemap.
- Public pages remain valuable without the ad. Do not create thin pages, doorway pages, duplicated
  pages, or pages primarily to show inventory.
- The page contains more publisher content than paid promotion, and mobile ad density stays below
  30%; Open Mermaid's one-slot rule is stricter.
- Provider approval, advertiser disclosures, and the privacy notice identify the actual operator
  and vendors. Advertising is never represented as an Open Mermaid recommendation.
- If programmatic inventory is used, publish and validate root `/ads.txt` with only authorized
  sellers and real account IDs. Google's
  [ads.txt guide](https://support.google.com/adsense/answer/12171612) recommends it to prevent
  counterfeit inventory. Never commit example IDs to production.
- Add a user-visible advertising/privacy contact before launch. Include a route for reporting
  deceptive or inappropriate creative without sending diagram content.

## Test plan

### Unit and build contract

- Validate every config mode, placement, date, dimension, destination, route kind, and asset path.
- Reject unknown schema versions, arbitrary markup, non-HTTPS destinations, unapproved hosts,
  expired campaigns, duplicate IDs, unsupported sizes, and network mode without reviewed origins.
- Assert `off` mode renders no ad element, empty space, style, provider script, preconnect, request,
  cookie, storage key, or advertising manifest on public pages or the editor.
- Assert only eligible detail routes receive phase-1 markup and at most one placement.
- Assert public static routes still contain no Mermaid or CodeMirror chunks.
- Assert direct mode retains the current application CSP and network mode changes only the reviewed
  directives/origins.
- In an ad-enabled release, validate `/ads.txt` where applicable, seller IDs, the advertising
  manifest, destination redirects, image dimensions, compressed size, and hashes.

### Browser and responsive

- Chromium, Firefox, and WebKit at 320×568, 768×1024, 1280×800, 1600×800, and 1920×1080.
- Ad-off, placeholder, direct, consent-pending, consent-rejected, consent-accepted, no-fill,
  timeout, blocked request, creative error, and kill-switch scenarios.
- Assert no overlap with navigation, source, preview, dialogs, toasts, export controls, or content
  links; capture bounding boxes before and after load.
- Assert source/preview minimum widths and fullscreen behavior at every editor-rail breakpoint.
- Capture `PerformanceObserver` layout-shift entries and fail on any ad-attributed unexpected shift.
- Verify one ad request at most, no background retry, no refresh, and no request while hidden.
- Confirm direct link relationships, target behavior, referrer omission, focus order, keyboard use,
  touch use, reduced motion, forced colors, 400% zoom, and screen-reader announcements.

### Privacy and malicious-frame corpus

Capture every request URL, header, body, cookie, storage mutation, navigation, popup, message, and
console event. Seed the editor with unique canary values in source, title, fragment, local IDs,
search, filename, and render errors; assert none appears in any advertising channel.

The hostile test creative attempts:

- parent DOM access and frame traversal;
- top navigation, new windows, downloads, forms, dialogs, clipboard, and device permissions;
- cookies, local/session storage, IndexedDB, storage-access APIs, and fingerprinting probes;
- unexpected nested frames, CSS/resource URLs, redirects, mixed content, and oversized resources;
- malformed or forged `postMessage` traffic;
- resize/overlay/click-capture behavior and continuous CPU/network work.

Tests must prove the configured containment, not merely check that the iframe has a `sandbox`
attribute.

### Performance and policy

- Run the existing ad-free Lighthouse/metadata/bundle gates unchanged.
- Add a separate ad-enabled Lighthouse profile and WebPageTest/provider-outage run.
- Compare request count, transfer, main-thread work, LCP, INP proxy/TBT, CLS, console errors, and
  failed requests with the ad-free artifact.
- Manually inspect every viewport for Better Ads and accidental-click risks.
- Run provider policy tools only against test inventory; operators never click production ads.
- Re-run legal, privacy, security, accessibility, and provider-policy review whenever format,
  provider, consent purposes, region, origin, or creative behavior changes.

## Rollout phases

### Phase 0 — decisions and evidence

1. Select the canonical production domain and owner/contact identity.
2. Decide whether the business model begins with direct sponsorship or a provider; direct
   sponsorship is the recommendation.
3. Approve allowed advertiser categories, creative policy, destination review, campaign ownership,
   pricing/reporting, complaint handling, and refund/takedown process.
4. Complete legal/privacy/consent and provider feasibility reviews.
5. Record a new ADR for activation, including the chosen click behavior and why.

**Exit:** signed decision record, data map, threat review, eligible route list, mockups at all
breakpoints, and no unresolved provider/boundary conflict.

### Phase 1 — inert placeholder system

1. Implement typed contracts, placement eligibility, build configuration, CSS reservation, manifest,
   and a striped development placeholder.
2. Keep production/release default `off`; prohibit placeholder mode on indexed builds.
3. Add build, unit, browser, accessibility, request-capture, and CLS gates.
4. Add ad-off and emergency-disable deployment artifacts.

**Exit:** all tests pass, ad-off output is byte/request clean, and placeholder screenshots are
approved. No commercial creative is live.

### Phase 2 — direct public sponsorship stripe

1. Add one reviewed, repository-owned static creative to eligible guide/template detail pages.
2. Update privacy/disclosure/contact content and campaign operations.
3. Validate destinations, `rel` values, accessible names, image budgets, timestamps, and no
   tracking.
4. Release to a noindexed staging origin, then a small production route set.
5. Compare ad-enabled and ad-free lab/CrUX windows; expand only if objectives remain green.

**Exit:** stable Core Web Vitals, zero ad-attributed CLS, no policy/accessibility findings, no source
leakage, and an exercised takedown/rollback procedure.

### Phase 3 — optional public network pilot

1. Select a provider only after written compatibility with the isolated architecture.
2. Deploy the separate ad origin, exact CSP, consent gate, privacy choices, `/ads.txt`, provider
   account controls, and hostile-frame suite.
3. Pilot one non-sticky stripe on a small set of public detail pages; no editor inventory.
4. Reconcile provider-reported requests/revenue with privacy and performance evidence.

**Exit:** provider-policy approval, consent audit, security review, field objectives, and operations
sign-off. If isolation is incompatible, remain on direct sponsorship.

### Phase 4 — optional editor rail

1. Reassess whether editor inventory is acceptable and eligible under the chosen provider's content
   policies.
2. Implement only the 160×600 wide-screen rail and the explicit click decision.
3. Run canary-data leakage, accidental-click, layout, fullscreen, and long editing-session tests.
4. Roll out separately from public ads with its own kill switch and measurement cohort.

**Exit:** no diagram-derived data, no control overlap, no mobile request, no editor width regression,
no refresh, zero unexpected layout shift, and explicit product/privacy/security approval.

## Release, kill switch, and operations

Use three independent controls:

1. **Build default:** `off`; an indexed release fails if advertising mode is missing or invalid.
2. **Placement allowlist:** campaign and route placement must both be enabled. Removing either
   produces no request in the next artifact.
3. **Emergency deployment:** retain the last tested ad-free image and Caddy configuration. For
   network mode, keep a tested additive Caddy CSP override that narrows `frame-src` back to
   `'self'` and make the owned ad origin return a non-cacheable empty response. This stops new
   provider loads while preserving the reserved box. Roll the application back by immutable image
   digest to remove the slot entirely, without relying on the provider, CMP, ad origin, or a client
   request.

For a provider/creative incident:

1. disable the placement or roll back to the ad-free image;
2. verify from a fresh browser that no provider request, cookie, frame, or reserved inventory
   remains;
3. preserve bounded edge/provider evidence without diagram or fragment data;
4. rotate affected provider credentials and block affected campaigns/origins;
5. assess privacy/security notification duties;
6. add the incident to the malicious-creative regression corpus before reactivation.

Routine operations:

- weekly destination, redirect, certificate, creative, policy-warning, fill/no-fill, and console
  review;
- monthly provider-origin/CSP diff, account-access, category-block, consent, ads.txt, transfer, and
  Core Web Vitals review;
- campaign-start and campaign-end screenshots at supported breakpoints;
- quarterly kill-switch exercise and provider data-retention/access review;
- immediate review when provider terms, Better Ads Standards, consent rules, or creative behavior
  changes.

Commercial measurement starts with campaign-level facts: scheduled dates, eligible page count,
provider aggregate impressions/viewability where approved, revenue, no-fill, creative failures, and
route-kind Core Web Vitals. Do not create a cross-page user profile, expose exact document routes in
editor measurements, or join campaign reporting to local performance or document data.

## Acceptance criteria

Advertising is ready to activate only when all of the following are true:

- the selected format, provider/direct model, routes, destinations, and click behavior are approved;
- the public privacy notice, advertising disclosure, contact, provider list, and consent flow match
  actual behavior;
- ad-off mode produces no advertising element, space, script, request, storage, identifier, or CSP
  allowance;
- consent-ineligible and rejected states make no provider request;
- request-capture canaries prove zero diagram, fragment, title, local ID, editor event, and search
  leakage;
- slot dimensions exist at first layout and automated evidence shows zero unexpected
  ad-attributable CLS;
- ads never overlay or sit adjacent to controls in a way that invites accidental clicks;
- mobile density and current Better Ads Standards pass at every supported viewport;
- keyboard, screen reader, forced-colors, reduced-motion, 320px, touch, and 400% zoom checks pass;
- ad-enabled Lighthouse retains the existing category floors and field objectives are not weakened;
- provider outage, blocked ads, no-fill, malformed creative, and timeout leave the product usable;
- CSP, iframe sandbox, permissions, referrer policy, ads.txt, origins, and creative hashes match the
  reviewed manifest;
- production credentials and IDs are absent from source artifacts except identifiers explicitly
  intended to be public, such as an approved ads.txt publisher ID;
- the ad-free immutable image, Caddy rollback, and incident runbook have been exercised;
- activation is recorded in a new ADR and receives explicit product, privacy, security,
  accessibility, performance, and operations sign-off.

Until these criteria are met, the existing primitives stay disabled and occupy no production
space.
