# Canonical domain decision

The product display name is **Open Mermaid**. Technical identifiers such as the package name, repository slug, database names, and likely domain label remain `openmermaid` where spaces are not valid.

The canonical top-level domain is intentionally unresolved. No source feature, document format, database schema, share envelope, or runtime module depends on `.app`, `.us`, or another suffix. `PUBLIC_SITE_URL` remains the single release input for canonical URLs, Open Graph metadata, JSON-LD, sitemap output, and production field reporting.

## Current recommendation

Prefer **`openmermaid.app`** if all of these launch gates pass:

1. the domain is available at an acceptable initial and renewal price;
2. name and trademark review approves the combined mark and domain;
3. the production host and rollback path are ready for HTTPS before the domain is used;
4. the name does not create unacceptable confusion with the upstream Mermaid project.

`.app` communicates that the primary experience is an application and remains geographically neutral. Google Registry includes the entire `.app` namespace in the HSTS preload list, so HTTPS is mandatory from the first connection. That aligns with Open Mermaid's security model but removes any option for an HTTP placeholder deployment.

Choose **`openmermaid.us`** only when a deliberate U.S. identity is part of the product position and the registrant continuously meets the usTLD Nexus requirements. `.US` carries eligibility, verification, and registration-data policy obligations that do not apply merely because a product serves U.S. visitors. Registrar privacy/proxy behavior must be reviewed against current usTLD policy before purchase.

Neither option receives an assumed SEO advantage. Content quality, one stable canonical origin, crawlability, performance, and links matter more than a speculative suffix benefit.

## Decision checklist

- Check availability, premium classification, renewal cost, transfer terms, and registrar support directly before purchase; this repository does not claim either name is available.
- Complete the broader name/domain/trademark checklist in [NAME_CLEARANCE.md](NAME_CLEARANCE.md).
- Record the registrant, registrar, recovery contacts, auto-renewal controls, DNSSEC decision, and renewal budget privately.
- Select exactly one canonical production origin. Redirect every owned alternative to it before indexing.
- Do not split public traffic between `.app` and `.us`; Chrome UX Report history and search signals are origin-specific.
- Keep previews on a separate noindex origin and never use a production URL fragment as an environment selector.
- Run `pnpm build:release` with the exact final HTTPS origin and verify the emitted canonical, sitemap, robots, Open Graph, JSON-LD, CSP, and field-report configuration.

## Rename and domain-change support

The visible product name is centralized, while protocols and persisted diagrams contain no canonical domain. A later domain change still requires redirects, new Search Console and Chrome UX Report baselines, social metadata review, documentation updates, and a privacy/security review. It does not require a document migration.
