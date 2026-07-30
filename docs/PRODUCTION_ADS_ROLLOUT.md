# Production advertising rollout

**Status:** Preparation runbook; production activation is currently blocked by the readiness gates
below.

**Supported provider:** Google AdSense

**Supported inventory:** One manually positioned `content-stripe` on each guide and template detail
page

This runbook turns the agency-advertising architecture into an ordered production rollout. It does
not authorize Auto ads, additional placements, another provider, advertising inside the editor, or
direct-sold campaigns. Complete the steps in order and retain evidence for each gate.

The default release remains `PUBLIC_AD_MODE=off`. Do not switch production to `agency` merely
because the application build accepts the configuration.

## 0. Close the current launch blockers

Agency mode must not be activated until these implementation items are complete and tested:

1. **Provider-compatible referrer policy on inventory pages.** Google states that its Privacy &
   Messaging solution may not appear when the site's referrer policy suppresses the cross-origin
   referrer. Open Mermaid currently sends and declares `Referrer-Policy: no-referrer`. Implement
   `strict-origin-when-cross-origin` only on agency-eligible public guide/template detail pages.
   Preserve `no-referrer` on the editor, renderer, fragment shares, telemetry requests, and all
   ad-off artifacts. Update the build, Caddy, portable-header, metadata, and deployment tests
   together. See Google's
   [Privacy & Messaging troubleshooting](https://support.google.com/adsense/answer/14660912).
2. **Persistent privacy-choice access.** Add a clearly labeled public-site control that reopens the
   configured consent/privacy message after the initial decision. It must support consent
   withdrawal and applicable US-state opt-out flows without appearing in the editor. Confirm the
   exact implementation against the selected CMP and legal review.
3. **Real-browser CMP matrix.** Exercise pending, accepted, rejected, withdrawn, limited,
   no-fill, blocked, and provider-outage states in Chromium, Firefox, Safari/WebKit, and iOS Safari.
   Confirm that content remains usable in every state.
4. **Production-origin request capture.** Prove that no Mermaid source, document metadata, URL
   fragment, editor state, product-telemetry identifier, or custom user identifier reaches Google
   or any nested advertising vendor.

Record the commit and test evidence that closes each blocker. Do not work around a failed CMP by
weakening the editor hostname, adding a cross-origin editor bridge, or disabling privacy choices.

## 1. Establish ownership and decisions

Assign named owners before creating the provider account:

- business/account owner for AdSense, payments, tax, and policy notices;
- privacy/legal owner for launch regions, consent language, vendors, retention, and user rights;
- engineering owner for the artifact, CSP, hostname boundary, and rollback;
- operations owner for DNS, Caddy, immutable deployment, monitoring, and incident response.

Record:

- the final public hostname, such as `https://openmermaid.app`;
- the distinct editor hostname, such as `https://app.openmermaid.app`;
- launch countries and applicable consent/opt-out regimes;
- whether aggregate template telemetry remains off or is independently approved;
- the approved provider, placement, policy version, and rollback artifact.

Do not use the same hostname for public content and the editor. Do not configure parent-domain
cookies such as `Domain=.openmermaid.app`.

## 2. Deploy the ad-off production foundation

Advertising approval should begin from a substantive, reachable, ad-free production site.

1. Configure public and editor DNS records.
2. Deploy the reviewed ad-off artifact behind the two Caddy site blocks.
3. Confirm automatic HTTPS for both hostnames.
4. Verify:

   - public `/editor/` returns a path-preserving `308` to the editor hostname;
   - public `/renderer/` returns `404`;
   - the editor hostname serves `/editor/`, `/renderer/`, and required assets;
   - the editor hostname returns `404` for public guides and templates;
   - no cookie uses the parent domain;
   - no advertising provider request occurs.

Build the foundation from a clean checkout:

```bash
corepack enable
pnpm install --frozen-lockfile

PUBLIC_SITE_URL=https://PUBLIC_HOSTNAME \
PUBLIC_EDITOR_ORIGIN=https://EDITOR_HOSTNAME \
PUBLIC_INDEX_SITE=true \
PUBLIC_TELEMETRY_MODE=off \
PUBLIC_AD_MODE=off \
pnpm build:release

pnpm test:metadata
pnpm test:independence
pnpm test:deployment:browser
```

Replace `PUBLIC_HOSTNAME` and `EDITOR_HOSTNAME` with real hostnames. Archive the commit, lockfile,
artifact manifest, image digest, SBOM, and verification output. Keep this immutable artifact as the
advertising rollback target.

## 3. Open and prepare the agency account

In AdSense:

1. Complete account, identity, payment, tax, and contact requirements.
2. Add the canonical public site. Do not add the editor hostname as advertising inventory.
3. Keep the site's public content, navigation, policies, and ownership information complete while
   it is reviewed.
4. Resolve every Policy center or site-readiness issue.
5. Record the site approval state and the account owner with recovery access.

Google describes site states such as `Requires review`, `Getting ready`, `Needs attention`, and
`Ready` in its [site-status documentation](https://support.google.com/adsense/answer/12170222).
Do not interpret a successful Open Mermaid build as provider approval.

## 4. Configure privacy and consent

Use Google Privacy & Messaging initially unless privacy/legal approves another Google-certified
CMP.

1. Create and publish the European regulations message for the EEA, UK, and Switzerland.
2. Use the reviewed three-choice experience where required: do not consent, consent, and manage
   options.
3. Review the vendor list, purposes, legitimate-interest choices, languages, branding, and consent
   mode settings.
4. Configure applicable US-state messages and geographic targeting.
5. Decide how users reopen privacy choices and withdraw consent.
6. Update the public privacy notice with the actual provider, purposes, data categories, choices,
   contact, and retention behavior.
7. Test messages from eligible regions or with provider-supported testing tools. Do not assume that
   absence of a message in the operator's location is success.

Google requires an appropriate certified CMP when serving personalized ads in the EEA, UK, and
Switzerland. The operator remains responsible for legal compliance. Review:

- [How the Google CMP works](https://support.google.com/adsense/answer/16918505)
- [European regulations messages](https://support.google.com/adsense/answer/10961068)
- [US-state regulations messages](https://support.google.com/adsense/answer/10961479)

Do not describe non-personalized or limited ads as anonymous. Delivery, security, fraud prevention,
and measurement can still process request and device information.

## 5. Create the approved ad unit

Create one manually positioned responsive display unit for `content-stripe`. Keep Auto ads,
anchors, vignettes, interstitials, sticky inventory, and refresh disabled.

Collect the two public identifiers from the generated AdSense code:

- publisher/client ID: `ca-pub-` followed by 16 digits;
- ad-slot ID: 1 to 20 digits.

Cross-check the publisher ID in **Account → Settings → Account information**. Google's
[publisher-ID documentation](https://support.google.com/adsense/answer/105516) shows where to find
it.

These identifiers are public configuration rather than secret API credentials, but they are
production-specific. Supply them through the controlled release environment and do not commit
live values to `.env.example`, tests, screenshots, or issue reports.

Do not paste an entire provider-generated script into an Astro page. The reviewed adapter constructs
the official asynchronous loader from the validated identifiers.

## 6. Build the agency artifact

Use a clean reviewed commit and the final production origins:

```bash
export PUBLIC_SITE_URL=https://PUBLIC_HOSTNAME
export PUBLIC_EDITOR_ORIGIN=https://EDITOR_HOSTNAME
export PUBLIC_INDEX_SITE=true
export PUBLIC_TELEMETRY_MODE=off
export PUBLIC_AD_MODE=agency
export PUBLIC_AD_PROVIDER=google-adsense
export PUBLIC_ADSENSE_CLIENT=ca-pub-REPLACE_WITH_16_DIGITS
export PUBLIC_ADSENSE_SLOT=REPLACE_WITH_SLOT_DIGITS

pnpm build:release
pnpm test:advertising
pnpm test:metadata
pnpm test:independence
pnpm test:licenses
pnpm sbom
```

The release validator must reject missing/example origins, malformed identifiers, an unindexed
agency build, and a shared public/editor hostname.

Inspect the result before packaging:

```bash
cat dist/ads.txt
node -e \
  "const m=require('./dist/openmermaid-advertising-manifest.json'); console.log(JSON.stringify(m,null,2))"
pnpm test:artifact
```

Confirm:

- `dist/ads.txt` contains only the seller record authorized for this account;
- the advertising manifest lists only guide/template detail routes;
- each eligible route has exactly one `content-stripe`;
- no provider bytes appear in editor, renderer, homepage, indexes, policies, or 404;
- the artifact manifest covers `ads.txt` and the advertising manifest;
- no source map, credential, reporting token, or provider API secret exists in `dist/`.

The build derives the standard Google seller line from the client ID. Compare it with the exact
snippet supplied in AdSense before deployment. Google's
[ads.txt guide](https://support.google.com/adsense/answer/12171612) is authoritative if the account
supplies a different relationship or additional authorized seller.

## 7. Verify the edge configuration

Configure the host-installed Caddy environment:

```dotenv
OPEN_MERMAID_SITE=PUBLIC_HOSTNAME
OPEN_MERMAID_EDITOR_SITE=EDITOR_HOSTNAME
OPEN_MERMAID_EDITOR_ORIGIN=https://EDITOR_HOSTNAME
OPEN_MERMAID_UPSTREAM=127.0.0.1:8088
```

Validate before reload:

```bash
sudo env \
  OPEN_MERMAID_SITE=PUBLIC_HOSTNAME \
  OPEN_MERMAID_EDITOR_SITE=EDITOR_HOSTNAME \
  OPEN_MERMAID_EDITOR_ORIGIN=https://EDITOR_HOSTNAME \
  OPEN_MERMAID_UPSTREAM=127.0.0.1:8088 \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Package the already-tested `dist/` into the pinned Docker image. Do not rebuild application source
inside the production container or at the edge.

Before agency activation, verify the final public responses:

```bash
curl --fail --silent --show-error https://PUBLIC_HOSTNAME/ads.txt
curl --fail --silent --show-error --head https://PUBLIC_HOSTNAME/guides/flowcharts/
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  https://PUBLIC_HOSTNAME/renderer/
curl --fail --silent --show-error --head https://EDITOR_HOSTNAME/editor/
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  https://EDITOR_HOSTNAME/guides/flowcharts/
```

Expected results:

- `ads.txt`: HTTP 200 at the public root with the approved seller record;
- public guide: HTTP 200 with the agency CSP and provider-compatible referrer policy;
- public renderer: HTTP 404;
- editor: HTTP 200 with the restrictive editor policy;
- guide on editor hostname: HTTP 404.

## 8. Perform a controlled production-origin validation

The agency bootstrap deliberately refuses to run on a hostname different from
`PUBLIC_SITE_URL`. Placeholder mode is the only supported noindexed layout preview; it never
contacts the provider. Consequently, real provider validation must use the approved production
origin in a controlled release window.

Before opening normal traffic:

1. Deploy the agency artifact by immutable digest.
2. Open one eligible guide and one template detail page without clicking an ad.
3. Confirm the CMP appears for targeted test conditions and can be accepted, rejected, managed,
   and reopened.
4. Capture the network, frames, storage, cookies, console, CSP reports, and layout shifts.
5. Confirm one ad request cycle, no application-controlled refresh, and a stable reserved box for
   fill, no-fill, blocked, and loader-failure states.
6. Open the editor hostname in a fresh browser profile and prove there are no requests to Google
   advertising or consent domains.
7. Put a unique canary in a local diagram source/title and verify that it appears in no public URL,
   request, header, cookie, frame, console entry, or provider report.
8. Run accessibility, keyboard, 320 px, 400% zoom, reduced-motion, forced-colors, and Safari/iOS
   checks.
9. Run the agency-specific Lighthouse/Web Vitals cohort. Do not combine it with ad-free baselines.

Operators must never click live inventory as a test. Do not use automated click or impression
generation.

## 9. Confirm provider readiness and reporting

In AdSense, verify:

- site status is `Ready`;
- ads.txt status is `Authorized`;
- there are no unresolved Policy center issues;
- the expected ad unit begins reporting requests, impressions, viewability, and revenue;
- consent/restricted-serving indicators match the approved configuration.

AdSense may need time to crawl `ads.txt`, approve a site, or begin serving. Google notes that
ads.txt status updates can take days and, on low-traffic sites, longer. Do not repeatedly remove and
resubmit the site or weaken privacy/security controls to accelerate approval.

Provider reports are authoritative for advertising metrics. Open Mermaid does not emit its own
impression, viewability, click, or revenue events. Ad blocking, denied consent, browser protection,
no-fill, and invalid-traffic adjustments mean provider counts will not equal page requests.

If daily reporting is later automated, use a separately reviewed server-side reporting job.
Credentials must never enter the static artifact, browser, editor hostname, telemetry collector, or
repository. Do not join provider reports to diagram data or product-telemetry event IDs.

## 10. Promote, monitor, and roll back

Promote only after all release-checklist items are signed off. During the first release window,
monitor:

- provider and CMP errors;
- CSP violations and unexpected vendor origins;
- consent and opt-out availability;
- fill/no-fill behavior and invalid-traffic notices;
- LCP, INP, CLS, and advertising-attributed layout shift;
- editor traffic for any advertising-domain request;
- Caddy/container warnings and availability.

Immediately roll back to the archived ad-off artifact for unexplained data flow, missing consent,
policy warning, material performance regression, layout/control overlap, editor-origin provider
traffic, or security incident.

After rollback, confirm:

```bash
if curl --fail --silent --show-error https://PUBLIC_HOSTNAME/guides/flowcharts/ |
  rg --quiet 'adsbygoogle|googlesyndication|data-ad-provider'; then
  echo "Advertising marker remains after rollback" >&2
  exit 1
fi

test "$(
  curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    https://PUBLIC_HOSTNAME/ads.txt
)" = 404
```

The first command must find no advertising marker and the ad-off artifact must return `404` for
`ads.txt`. Purge any stale public copy and confirm the advertising manifest is also unavailable.
Keep the editor origin online throughout an advertising rollback.

## Adding another agency later

AppLovin and other providers are not implemented by this release. Do not reuse the
`google-adsense` adapter with different script URLs. A new provider requires:

- a typed adapter and identifier validation;
- current provider policy, web support, CMP, CSP, ads.txt, and reporting review;
- a complete vendor/data/recipient inventory;
- route and origin-gated build tests;
- consent, browser, accessibility, performance, security, and rollback evidence;
- an updated privacy notice and policy-version decision.

The public/editor hostname boundary and the prohibition on diagram data remain unchanged.
