/**
 * Keep the editor's first-paint source independent from the complete template
 * catalog. The catalog reuses this value, while the editor can start without
 * downloading every maintained template.
 */
export const DEFAULT_MERMAID_SOURCE = `flowchart LR
  Start([Start]) --> Check{Ready?}
  Check -->|Yes| Ship[Ship the change]
  Check -->|No| Revise[Revise the plan]
  Revise --> Check`;
