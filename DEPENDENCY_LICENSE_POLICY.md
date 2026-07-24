# Dependency license policy

Open Mermaid is distributed under MIT, but every dependency and bundled asset retains its own license. A dependency may be technically useful and still be unsuitable for the standalone distribution, documentation, examples, or future commercial funding model.

## Scope

This policy covers direct and transitive runtime dependencies, development and build tools, copied source, fonts, icons, images, datasets, templates, generated bundles, and container images used to create a release.

## Default acceptance

The automated gate accepts these SPDX identifiers after provenance and notice review:

- MIT, MIT-0, ISC, 0BSD, BSD-2-Clause, and BSD-3-Clause;
- Apache-2.0, including its notice and patent terms;
- BlueOak-1.0.0, Python-2.0, and Unlicense;
- CC0-1.0, CC-BY-3.0, and CC-BY-4.0 for appropriate data or documentation assets, including applicable attribution.

MPL-2.0 and other file-level reciprocal licenses require maintainer review. They may be acceptable when obligations are understood, covered source files remain available as required, and distribution does not combine them in a way that creates an unplanned obligation.

SPDX expressions are evaluated according to their operators: every branch of `AND` must be allowed, while one policy-compliant branch of `OR` is sufficient and is recorded in the report. Parentheses are preserved. `WITH` exceptions fail closed until that exact SPDX exception is added to policy. A package-specific approval never makes its license generally acceptable.

## Requires explicit legal review

- GPL, LGPL, AGPL, SSPL, EUPL, or other strong, network, or ambiguous copyleft terms proposed for a shipped artifact, plus any build dependency whose reciprocal components would be copied into an output;
- source-available, non-commercial, ethical-use, field-of-use, or custom licenses;
- packages with multiple conflicting license declarations;
- unlicensed, unknown, `SEE LICENSE IN`, or missing-license packages;
- trademarked assets, remote fonts, example content, or datasets without clear redistribution rights;
- dependencies whose license changes between the reviewed source and installed artifact.

No package in this category may ship merely because an automated tool reports a partial or guessed match.

## Review requirements

Every dependency change must document:

1. the capability and why a browser-native or existing solution is insufficient;
2. exact pinned version, registry/source, maintainership, integrity, and release history;
3. declared license plus the actual license files in the installed artifact;
4. runtime, build-time, optional, and transitive bundle impact;
5. attribution, notice, source-offer, modification, or patent obligations;
6. security and privacy effects, especially network, storage, dynamic code, and telemetry behavior;
7. whether `THIRD_PARTY_NOTICES.md`, generated notices, or deployment documentation changes.

## Automated gates and SBOMs

CI installs from the frozen lockfile, checks every installed production and development dependency version, fails unknown or denied licenses, emits `reports/dependency-licenses.json`, and generates a schema-validated CycloneDX SBOM for browser/build dependencies. The deployment job builds the artifact-only image and generates a separate CycloneDX container SBOM covering NGINX, Alpine, and included operating-system packages. Automation is evidence, not legal advice: maintainers must review false positives, dual-license expressions, vendored subcomponents, generated browser bundles, and container package licenses.

Both release SBOMs and the generated complete JavaScript license report are release artifacts. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) provides a human-readable summary of direct runtime components and does not replace license files, base-image notices, or either SBOM.

### Container-image review hold

The pinned NGINX Unprivileged Alpine image is allowed for development, CI, private validation, and deployment preparation. Its unmodified operating-system utilities include GPL and LGPL components, so publishing the derived Open Mermaid image requires a maintainer or counsel to confirm corresponding-source availability, license-text and notice delivery, and any written-offer obligations for the actual distribution channel. This hold does not apply to `dist/`, which contains none of those binaries.

The reviewed boundary is exact: `nginxinc/nginx-unprivileged:1.30.4-alpine-slim@sha256:e88d990b349df8cf4aa82f16642d7a23375016638c9ace4e5c6ca25028e62e65`. A tag, digest, package set, declared-license, or distribution-channel change reopens the review. The container SBOM, upstream image notices, and applicable source archives must be retained with the release evidence.

## Pinned review registry

These decisions are exact-version exceptions, not ranges. Any package version or declared-license change fails closed and requires a new review. Build-only approval does not authorize putting the package or binary into `dist/` or another shipped artifact.

The project maintainers own every current entry. Its exit and re-review triggers are a version or license-metadata change, a change in how the package reaches build output, replacement by an already accepted dependency, or removal of the capability that requires it.

| Package and version                  | Reported license  | Decision and boundary                                                                                                                                               |
| ------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `khroma@2.1.0`                       | Unknown           | Classify as MIT because the installed lowercase `license` file contains the standard MIT text.                                                                      |
| `parse-cache-control@1.0.1`          | BSD               | Classify as BSD-3-Clause because the installed `LICENSE` file contains all three clauses. Development only.                                                         |
| `@axe-core/playwright@4.12.1`        | MPL-2.0           | Permit as a development-only accessibility test adapter; do not bundle its source into the static site.                                                             |
| `axe-core@4.12.1`                    | MPL-2.0           | Permit as a development-only accessibility test engine; do not bundle its source into the static site.                                                              |
| `lightningcss@1.33.0`                | MPL-2.0           | Permit as an unmodified build-time Vite transformer; do not redistribute its source files in `dist/`.                                                               |
| `lightningcss-linux-x64-gnu@1.33.0`  | MPL-2.0           | Permit as the unmodified CI platform build binary; do not include it in the portable static artifact. Other platform packages require their own exact review.       |
| `@img/sharp-libvips-linux-x64@1.3.2` | LGPL-3.0-or-later | Permit the unmodified Astro/sharp build dependency in CI; do not include it in the portable static artifact. Redistribution requires a separate obligations review. |

## Exceptions and removal

An exception requires a written record naming the package, exact version or narrow range, counsel or maintainer review as appropriate, obligations, owner, and exit plan. If a dependency becomes incompatible, compromised, abandoned, unexpectedly networked, or materially larger than its value, maintainers may pin, replace, isolate, or remove it before the next release.
