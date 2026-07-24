# Open Mermaid visual system

Open Mermaid uses an original, repository-owned interface inspired by the general visual principles in the [Refero Ameba style reference](https://styles.refero.design/style/371df039-a090-402b-b2e4-21ab38e07625): a midnight atmospheric shell, restrained signal color, flat light product surfaces, hairline structure, and small radii. It does not copy Ameba screenshots, artwork, wordmark, source code, product text, or proprietary typography.

## Design character

- Marketing surfaces use a deep midnight canvas with a single radial atmosphere and an original node-grid treatment.
- The editor reads as a precise product workspace: document library, source, and preview separated by hairline borders.
- Signal blue is reserved for primary actions, active state, and focus on light surfaces.
- Arc cyan is decorative energy on dark surfaces, not ordinary body text or control chrome.
- Cards and controls use 4–8px radii, not pills or oversized rounded containers.
- Structure comes from spacing, borders, and surface contrast. Product cards do not rely on drop shadows.

## Core tokens

| Role            | Value     | Use                                 |
| --------------- | --------- | ----------------------------------- |
| Midnight        | `#00052e` | Dark navigation, hero, editor shell |
| Midnight raised | `#06105a` | Dark hover and atmospheric center   |
| Signal blue     | `#1742d1` | Primary action and active UI        |
| Arc cyan        | `#34fcff` | Sparse decorative signal            |
| Halo            | `#afb4db` | Muted text on midnight              |
| Paper           | `#ffffff` | Product surfaces                    |
| Silver border   | `#dbdcdf` | Hairline structure                  |
| Radius small    | `4px`     | Tags and compact labels             |
| Radius standard | `8px`     | Cards, dialogs, and buttons         |
| Content width   | `1200px`  | Public-page shell                   |

Dark and forced-color modes remap semantic roles rather than relying on these literal values everywhere.

## Typography and assets

Open Mermaid keeps system sans-serif and monospace stacks. Marketing headings use lighter weight and tight tracking; status, metric, and machine-readable labels use the system monospace stack. No remote font request is allowed.

The Refero source names F37 Bolton, but that is proprietary and is not included. Open Sauce Sans and IBM Plex may be evaluated later only if their self-hosted byte cost and licenses pass the existing performance and dependency gates.

Icons and identity graphics remain repository-owned SVG or code-native shapes. The abstract grid/glow is deliberately different from Ameba's particle-sphere artwork.

## Interaction and accessibility

- Every action retains at least a 44px effective touch target where the control is used on touch layouts.
- Focus uses signal blue on paper and a high-contrast light/cyan treatment on midnight surfaces.
- Hover uses border or color changes, not movement-dependent meaning.
- Motion is optional, short, and removed under `prefers-reduced-motion`.
- Muted text on midnight uses Halo or a lighter mapped token; the darker gray from the reference does not meet the intended normal-text contrast.
- Success, warning, and error states always retain text or icon meaning in addition to color.
- The responsive Source/Preview tabs remain the narrow-screen editor model; visual inspiration never overrides keyboard, touch, or screen-reader behavior.

## Review rule

Treat this file and the semantic CSS tokens as authoritative for Open Mermaid. The Refero page is inspiration and research context, not a vendored design-system dependency or a license to reuse Ameba brand material.
