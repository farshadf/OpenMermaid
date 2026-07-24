# Third-party notices

Open Mermaid is MIT-licensed. The components listed below remain governed by their own licenses. This human-readable list covers direct runtime dependencies pinned for v1; the frozen lockfile, installed license files, generated complete license report, and CycloneDX SBOM are authoritative for a specific release artifact. The complete machine-readable report covers both production and development dependencies.

| Component                   | Purpose                                                                        | License               |
| --------------------------- | ------------------------------------------------------------------------------ | --------------------- |
| Astro and `@astrojs/preact` | Static rendering, routing, and editor-island integration                       | MIT                   |
| `@astrojs/sitemap`          | Static sitemap generation                                                      | MIT                   |
| Preact                      | Hydrated editor user interface                                                 | MIT                   |
| Mermaid                     | Diagram parsing and rendering inside the sandboxed renderer                    | MIT                   |
| CodeMirror packages         | Source editor, language support, search, completion, commands, and diagnostics | MIT                   |
| idb                         | Typed IndexedDB wrapper                                                        | ISC                   |
| fflate                      | Local compression and decompression for snapshot links                         | MIT                   |
| DOMPurify                   | Sanitization of generated SVG                                                  | MPL-2.0 OR Apache-2.0 |
| web-vitals                  | Deferred local Web Vitals measurement                                          | Apache-2.0            |
| NGINX                       | Static server in the optional self-hosted artifact image                       | BSD-2-Clause-like     |
| NGINX Unprivileged image    | Non-root Alpine container packaging and configuration                          | Apache-2.0            |

Mermaid and other packages include transitive components with their own notices. Open Mermaid does not claim ownership of the Mermaid name, syntax, or upstream project identity.

License metadata note: Mermaid's transitive `khroma@2.1.0` package omits a `license` field from `package.json`, but its installed lowercase `license` file contains the standard MIT license and copyright notice. The automated gate records that reviewed MIT classification explicitly instead of accepting arbitrary unknown metadata.

The complete inventory also includes exact, build/test-only approvals for MPL-2.0 and LGPL components. Those approvals are recorded in [DEPENDENCY_LICENSE_POLICY.md](DEPENDENCY_LICENSE_POLICY.md), are tied to the installed version and declared license, and do not authorize adding those tools to the portable `dist/` artifact.

The Dockerfile pins the complete NGINX Unprivileged image index by digest. The image definition is Apache-2.0 and NGINX is distributed under its two-clause BSD-like license, but the Alpine runtime also contains unmodified GPL-2.0, GPL-3.0, LGPL-2.1, MPL-2.0, MIT, BSD, Apache, and zlib-licensed packages. They are separate operating-system tools and libraries, not browser application dependencies. The release container SBOM is the exact package inventory. Public image distribution remains subject to the source, notice, and license-text obligations review in `DEPENDENCY_LICENSE_POLICY.md`; the portable `dist/` artifact does not contain those packages.

Host-installed Caddy and the pinned Caddy integration-test image are Apache-2.0 operational/test dependencies and are not included in `dist/` or the Open Mermaid image.

Before release:

```bash
pnpm install --frozen-lockfile
pnpm test:licenses
pnpm sbom
pnpm test:deployment
```

The commands create `reports/dependency-licenses.json` and `reports/sbom.cdx.json` and verify the shipped image boundary. CI additionally generates and retains `reports/container-sbom.cdx.json` from the exact built image.

Retain this notice file, the generated complete license report, SBOM, lockfile, source commit, and artifact checksum together. Report a missing or incorrect notice through a repository issue; use the private security process only when the finding has a security impact.
