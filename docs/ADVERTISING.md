# Future advertising boundary

Advertising is not active in v1. Disabled static `banner` and `content-rail` slots render no element. The editor shell keeps one hidden, inert `editor-rail` marker (`data-enabled="false"`) as a future layout boundary; CSS removes it from layout. Disabled primitives create no blank space, script, request, cookie, identifier, or layout shift.

Any proposal to activate advertising requires a separate architecture and privacy review, updated performance measurements, and explicit release approval.

## Non-negotiable editor boundary

A future editor ad may appear only:

- in a fixed wide-screen rail outside editor and preview controls;
- above a documented minimum viewport width;
- with dimensions reserved before the request to avoid layout shift;
- in a sandboxed iframe served from a separate origin;
- without `allow-same-origin`, top navigation, popups, forms, downloads, storage access, or parent DOM access;
- without diagram source, document title, filename, local IDs, URL fragment, editor events, template choice, render status, or user-entered search terms;
- without appearing on mobile, over controls, inside the preview, or in exported output.

The parent may pass only a constant placement identifier and coarse, non-user-specific theme choice if approved. It must not pass a page URL containing a fragment. Prefer constructing the ad iframe URL from a fixed constant rather than `location.href`.

## Consent and privacy

Before any provider code ships, document:

- provider and every network origin;
- cookies, local storage, fingerprinting, identifiers, and measurement behavior;
- regional consent and opt-out requirements;
- retention, sale/share, cross-context behavior, and child-directed-content implications;
- CSP, permissions policy, sandbox flags, and incident shutdown path;
- how a user can use the standalone editor without accepting non-essential tracking.

If a provider cannot operate without access to the editor origin, parent DOM, URL fragment, document-derived context, or cross-site identifiers that conflict with the privacy promise, it is not an acceptable editor provider.

## Performance

Measure ad-enabled routes separately from the ad-free baseline. Retain the v1 Core Web Vitals objectives and report provider blocking time, transfer size, CLS, failed requests, and console errors. The ad integration needs a timeout, collapse policy that does not shift controls, and a remote-independent kill switch at deployment time.

Public pages may use a content rail or banner only after the same privacy and performance review. Empty inventory never renders in the ad-free build.
