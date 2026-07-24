# Accessibility quality bar

Open Mermaid targets WCAG 2.2 Level AA for the application shell and authored public pages. This target does not make arbitrary user-provided Mermaid source or generated diagrams automatically conformant.

## Product responsibilities

- semantic landmarks, headings, labels, descriptions, status messages, and errors;
- complete keyboard operation without traps;
- visible focus, logical focus order, and focus restoration after dialogs/actions;
- touch targets and layouts usable at 320 CSS pixels and 400% zoom;
- light, dark, forced-color, system theme, and reduced-motion support;
- source/preview tabs that expose state and relationships to assistive technology;
- non-color cues for validity, conflicts, destructive actions, and maturity labels;
- preserved Mermaid source and guidance for `accTitle` and `accDescr`;
- static examples with `<title>`, `<desc>`, and visible equivalent descriptions;
- errors that identify the source location without removing the last valid preview;
- no timed interaction required for authoring or recovery.

## Author responsibilities

Authors must decide whether the diagram accurately communicates its purpose and whether the final publishing surface is accessible. They should:

- write a specific title and concise purpose/conclusion description;
- keep the source or an equivalent ordered list/table available;
- avoid relying on color, shape, or position alone;
- control density and reading order;
- check contrast against the actual export background;
- test the final embedded SVG, raster image, document, or presentation—not only the editor.

Open Mermaid must never show a blanket “accessible” badge for a valid diagram.

## Automated gates

- axe checks on public routes and core editor states with zero serious or critical findings;
- semantic HTML, label, name/role/value, contrast, and landmark assertions;
- responsive screenshots/measurements at 320px and representative desktop sizes;
- keyboard workflows for document management, editor commands, preview tabs, export, sharing, and dialogs;
- reduced-motion and forced-colors emulation where supported;
- Accessibility score 100 in Lighthouse for static routes, the editor shell, and performance
  diagnostics.

Automation does not replace manual review.

## Manual release matrix

1. Keyboard-only operation in each supported browser engine.
2. Screen-reader smoke test of navigation, document library, CodeMirror label/instructions, diagnostics, source/preview mode, export controls, share warning, storage error, conflict dialog, and delete undo.
3. Browser zoom to 400% and text-spacing override without lost content or two-dimensional page scrolling except the diagram/editor regions that require it.
4. 320px CSS viewport and current iOS Safari touch operation.
5. Forced-colors mode and both high/low ambient theme choices.
6. Reduced-motion preference with no essential information conveyed only through animation.
7. Large source, long title, Unicode, right-to-left text inside source, and long translated-string simulation.
8. Exported SVG and PNG reviewed with their final background and text alternative.

Record browser/assistive-technology versions and unresolved limitations in the release evidence.
