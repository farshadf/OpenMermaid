# Security policy

Open Mermaid treats diagram source, imported files, URL fragments, renderer messages, generated SVG, browser storage, and filenames as untrusted input.

## Supported versions

Until the first stable public release, only the latest commit on the default branch is supported. After v1, the latest stable release receives security fixes. Older releases may receive a patch only when maintainers explicitly announce support.

| Version                         | Supported                    |
| ------------------------------- | ---------------------------- |
| Latest default branch before v1 | Yes                          |
| Latest stable release after v1  | Yes                          |
| Older or modified deployments   | No, unless explicitly stated |

## Report privately

Use a [private GitHub security advisory](https://github.com/farshadf/OpenMermaid/security/advisories/new). Do not open a public issue or discussion for an uncoordinated vulnerability.

Include only the information needed to reproduce and assess the finding:

- affected version, commit, route, and browser;
- threat scenario and expected security boundary;
- minimal source, payload, or steps;
- observed network request, execution, navigation, dialog, storage effect, or exported output;
- a proof of concept that avoids real secrets and personal data;
- suggested remediation if available.

Do not send production credentials, private diagrams, or unrelated personal information. If GitHub private advisories are unavailable, contact the repository owner through a private channel listed on their GitHub profile and reference this policy without including exploit details in the initial message.

## Response targets

These are best-effort goals, not a service-level agreement:

- acknowledge a complete report within 3 business days;
- provide an initial severity and next step within 7 business days;
- coordinate remediation and disclosure based on exploitability and affected releases;
- credit reporters who request credit and follow coordinated disclosure.

Maintainers may ask for additional evidence, merge duplicate reports, or decline issues that require a malicious host, unsupported browser modification, or a user intentionally bypassing an explicit warning without crossing a documented boundary.

## Security invariants

- The application is fully functional without a backend, account, OpenAI/ChatGPT connection, analytics service, or API key.
- Mermaid executes in an application-owned iframe with `sandbox="allow-scripts"`; the parent never inserts unsanitized renderer SVG.
- Renderer messages use a validated, revision-numbered protocol and expected source/origin checks.
- Mermaid’s strict security level and secure settings cannot be overridden by diagram source or user preferences.
- Scripts, event handlers, executable links, remote resources, CSS imports/URLs, and unsafe foreign content are removed from exported SVG.
- Rendering and sharing enforce input, output, time, edge, compressed, and decompressed bounds.
- The application discards stale renders and retains the last known-good preview when new source is invalid.
- Static public pages do not ship Mermaid or CodeMirror runtime chunks.
- The default telemetry-off artifact emits no aggregate-reporting client, request, queue, or relaxed
  connection policy.
- The optional aggregate adapter accepts only exact, bounded template-use payloads with an
  allowlisted template ID, stores no raw event rows, and never receives diagram source, document
  metadata, URL state, performance data, identity, or session data.
- No active ad code has access to the editor, URL fragment, document source, or same-origin storage.

## Deployment responsibility

The repository produces static files, an optional isolated aggregate collector, and provider
examples. Operators are responsible for HTTPS, canonical origin, exact telemetry routing when
enabled, security headers, caching, preview noindex controls, access logs, artifact integrity,
dependency updates, and rollback. A deployment that weakens the included policy or injects
third-party scripts has a different threat model and must not make the same privacy claim without
review.

See [docs/SECURITY_HEADERS.md](docs/SECURITY_HEADERS.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
