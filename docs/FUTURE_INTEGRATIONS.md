# Future ChatGPT and AI integrations

This document preserves a future-compatible boundary; it does not authorize ChatGPT, MCP, OpenAI, or AI-provider code in v1.

## Independence contract

The standalone website and shared core:

- build and test with every ChatGPT/OpenAI-related environment variable absent;
- do not import ChatGPT, MCP, OpenAI, or AI-provider packages;
- never require a platform session, host bridge, backend, account, or API key;
- remain the canonical owner of document validation, migrations, rendering protocol, URL codec, and export rules.

Future integrations import the shared contracts. The dependency direction never reverses.

## Future ChatGPT App

A ChatGPT App would be a separately built interactive widget plus a separately deployed MCP service. Its supported flow is:

1. The active chat explicitly supplies Mermaid source or an Open Mermaid snapshot URL to a declared tool.
2. The service validates size, version, and schema and returns only the explicit document data needed by the widget.
3. The widget imports shared document/editor contracts and opens a fullscreen-capable editing experience when the host permits it.
4. The user edits locally in the widget and can export without publishing.
5. Results return to the active chat only after an explicit **Send to chat** action through the host bridge.
6. The integration discloses that selected content passes through ChatGPT and the MCP endpoint and documents its retention/security policy.

Unsupported assumptions:

- arbitrary access to a user’s ChatGPT transcript or linked session;
- scraping `chatgpt.com/share` pages;
- silently reading another chat, browser history, clipboard, or Open Mermaid local storage;
- automatically sending every edit or render back to the conversation;
- using the standalone editor’s fragment or source for ads or analytics;
- making the website fail when ChatGPT or the MCP service is unavailable.

The provider-neutral `EditorHostBridge` interface grants no capability by itself. The v1 standalone implementation explicitly enables browser fullscreen, local file upload, and ordinary site navigation while keeping remote publishing disabled. A future widget supplies its own least-privilege capability set and host-specific implementation in a separate package.

## Future API-funded AI generation

An AI generator is not a placeholder button in v1. A future proposal must specify:

- funding through separately approved owner funding, user-supplied credentials, or another non-owner-funded model;
- where prompts, source, outputs, credentials, and telemetry travel and are retained;
- explicit user action before content leaves the device;
- server-side credential isolation when owner-funded keys are used;
- abuse, cost, rate-limit, model-change, and outage behavior;
- provider terms, data controls, and regional requirements;
- accessibility and safety behavior for generated source;
- evaluation fixtures and clear disclosure that output still requires validation and human review.

Generated source enters through the same bounded, validated document-creation path as imports and templates. The generator cannot bypass schema validation, renderer containment, source limits, or sanitization.

## Versioning

If shared contracts move into a workspace package later, publish explicit schema and protocol versions. Standalone releases must not be forced to upgrade because a platform adapter changes. Unknown future versions fail closed with a source/export recovery path.
