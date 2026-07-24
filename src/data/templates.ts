export type DiagramMaturity = 'stable' | 'beta' | 'experimental';

export interface DiagramTemplate {
  slug: string;
  name: string;
  diagramType: string;
  maturity: DiagramMaturity;
  summary: string;
  useWhen: string;
  source: string;
  sourceDescription: string;
  commonErrors: readonly string[];
  relatedGuide: string;
  keywords: readonly string[];
  visualKind: 'flow' | 'sequence' | 'chart' | 'structure';
}

/**
 * The in-repository catalog tracks every diagram family documented by the pinned
 * Mermaid release. Maturity describes upstream documentation, not Open Mermaid
 * support quality. Beta and experimental entries are deliberately labeled in UI.
 */
export const diagramTemplates: readonly DiagramTemplate[] = [
  {
    slug: 'flowchart-starter',
    name: 'Flowchart starter',
    diagramType: 'Flowchart',
    maturity: 'stable',
    summary: 'Map a decision or process with a clear beginning, branch, and outcome.',
    useWhen: 'Use a flowchart for processes, decisions, system paths, and troubleshooting trees.',
    source: `flowchart LR
  Start([Start]) --> Check{Ready?}
  Check -->|Yes| Ship[Ship the change]
  Check -->|No| Revise[Revise the plan]
  Revise --> Check`,
    sourceDescription: 'A left-to-right process that loops until a change is ready to ship.',
    commonErrors: [
      'Reusing a node ID for two concepts causes Mermaid to merge them.',
      'Special punctuation in labels may need quotation marks.',
    ],
    relatedGuide: 'flowcharts',
    keywords: ['process', 'decision', 'workflow'],
    visualKind: 'flow',
  },
  {
    slug: 'sequence-starter',
    name: 'Sequence diagram starter',
    diagramType: 'Sequence diagram',
    maturity: 'stable',
    summary: 'Show a request and response across a browser, service, and data store.',
    useWhen: 'Use a sequence diagram when order, ownership, and message direction matter.',
    source: `sequenceDiagram
  autonumber
  actor User
  participant Browser
  participant Store as Local store
  User->>Browser: Save diagram
  Browser->>Store: Write revision
  Store-->>Browser: Saved
  Browser-->>User: Show confirmation`,
    sourceDescription: 'A save interaction between a user, browser, and local store.',
    commonErrors: [
      'Participant IDs cannot contain spaces unless you define an alias.',
      'Use ->> and -->> consistently so call and response directions stay readable.',
    ],
    relatedGuide: 'sequence-diagrams',
    keywords: ['api', 'messages', 'interaction'],
    visualKind: 'sequence',
  },
  {
    slug: 'class-starter',
    name: 'Class diagram starter',
    diagramType: 'Class diagram',
    maturity: 'stable',
    summary: 'Describe a small document model and its repository contract.',
    useWhen: 'Use a class diagram for domain models, interfaces, and object relationships.',
    source: `classDiagram
  class DiagramDocument {
    +string id
    +string title
    +string source
    +save()
  }
  class DiagramRepository {
    <<interface>>
    +list()
    +put(document)
  }
  DiagramRepository ..> DiagramDocument : stores`,
    sourceDescription: 'A document class used by a repository interface.',
    commonErrors: [
      'Method signatures with punctuation are easiest to read one per line.',
      'Choose the relationship arrow that matches the intended semantics.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['uml', 'model', 'interface'],
    visualKind: 'structure',
  },
  {
    slug: 'state-starter',
    name: 'State diagram starter',
    diagramType: 'State diagram',
    maturity: 'stable',
    summary: 'Model the lifecycle of a locally edited diagram.',
    useWhen: 'Use a state diagram for lifecycles, finite states, and valid transitions.',
    source: `stateDiagram-v2
  [*] --> Draft
  Draft --> Validating: edit
  Validating --> Ready: valid
  Validating --> Draft: error
  Ready --> Draft: edit
  Ready --> [*]: export`,
    sourceDescription: 'A diagram moves from draft through validation to export.',
    commonErrors: [
      'Declare the v2 syntax when relying on modern state-diagram behavior.',
      'A transition needs both a source and destination state.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['state machine', 'lifecycle', 'transition'],
    visualKind: 'flow',
  },
  {
    slug: 'er-starter',
    name: 'Entity relationship starter',
    diagramType: 'Entity relationship diagram',
    maturity: 'stable',
    summary: 'Sketch documents, folders, and revisions with explicit cardinality.',
    useWhen: 'Use an ER diagram for database entities, records, keys, and cardinality.',
    source: `erDiagram
  FOLDER ||--o{ DIAGRAM : contains
  DIAGRAM ||--o{ REVISION : records
  FOLDER {
    string id PK
    string name
  }
  DIAGRAM {
    string id PK
    string title
  }
  REVISION {
    int number PK
    string source
  }`,
    sourceDescription: 'Folders contain diagrams, and diagrams record revisions.',
    commonErrors: [
      'Cardinality markers must appear on both ends of a relationship.',
      'Attribute declarations use type, name, and optional key marker in that order.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['database', 'schema', 'cardinality'],
    visualKind: 'structure',
  },
  {
    slug: 'journey-starter',
    name: 'User journey starter',
    diagramType: 'User journey',
    maturity: 'stable',
    summary: 'Describe a beginner’s path from choosing a template to exporting.',
    useWhen: 'Use a journey diagram to compare steps, satisfaction, and participants.',
    source: `journey
  title Create a first diagram
  section Start
    Choose a template: 5: User
    Edit the labels: 4: User
  section Finish
    Check the preview: 5: User, Browser
    Export SVG: 5: User, Browser`,
    sourceDescription: 'A four-step journey from a template to an SVG export.',
    commonErrors: [
      'Scores must use the supported numeric range.',
      'Separate the score and actors with colons exactly as shown.',
    ],
    relatedGuide: 'accessible-diagrams',
    keywords: ['ux', 'experience', 'journey'],
    visualKind: 'chart',
  },
  {
    slug: 'gantt-starter',
    name: 'Gantt chart starter',
    diagramType: 'Gantt chart',
    maturity: 'stable',
    summary: 'Plan a small release with dependencies and milestones.',
    useWhen: 'Use a Gantt chart when duration, sequencing, and dependencies matter.',
    source: `gantt
  title Documentation release
  dateFormat YYYY-MM-DD
  axisFormat %b %d
  section Prepare
  Draft content :done, draft, 2026-07-01, 3d
  Review :active, review, after draft, 2d
  section Publish
  Release :milestone, release, after review, 0d`,
    sourceDescription: 'A documentation release moving from drafting to review and publication.',
    commonErrors: [
      'Dates must match the declared dateFormat.',
      'Dependency IDs must refer to an earlier task ID.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['project', 'timeline', 'planning'],
    visualKind: 'chart',
  },
  {
    slug: 'pie-starter',
    name: 'Pie chart starter',
    diagramType: 'Pie chart',
    maturity: 'stable',
    summary: 'Show a simple part-to-whole breakdown with honest labels.',
    useWhen: 'Use a pie chart only for a few non-negative parts of one whole.',
    source: `pie showData
  title Documentation effort
  "Examples" : 45
  "Explanations" : 35
  "Review" : 20`,
    sourceDescription: 'Documentation effort split among examples, explanations, and review.',
    commonErrors: [
      'Category labels should be quoted.',
      'Too many slices are difficult to compare; consider an XY chart instead.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['proportion', 'percentage', 'chart'],
    visualKind: 'chart',
  },
  {
    slug: 'quadrant-starter',
    name: 'Quadrant chart starter',
    diagramType: 'Quadrant chart',
    maturity: 'stable',
    summary: 'Compare tasks across effort and expected impact.',
    useWhen: 'Use a quadrant chart to position items against two bounded dimensions.',
    source: `quadrantChart
  title Work prioritization
  x-axis Low effort --> High effort
  y-axis Low impact --> High impact
  quadrant-1 Plan carefully
  quadrant-2 Do next
  quadrant-3 Reconsider
  quadrant-4 Quick wins
  Templates: [0.25, 0.80]
  Export polish: [0.55, 0.70]
  Custom themes: [0.75, 0.45]`,
    sourceDescription: 'Three product tasks positioned by effort and impact.',
    commonErrors: [
      'Point coordinates must be normalized between zero and one.',
      'Keep axis directions explicit so readers interpret the quadrants correctly.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['priority', 'matrix', 'comparison'],
    visualKind: 'chart',
  },
  {
    slug: 'requirement-starter',
    name: 'Requirement diagram starter',
    diagramType: 'Requirement diagram',
    maturity: 'stable',
    summary: 'Connect a privacy requirement to the component that satisfies it.',
    useWhen: 'Use a requirement diagram for traceability between requirements and elements.',
    source: `requirementDiagram
  requirement local_data {
    id: REQ1
    text: Diagram source stays local by default
    risk: high
    verifymethod: test
  }
  element browser_store {
    type: IndexedDB repository
    docref: architecture
  }
  browser_store - satisfies -> local_data`,
    sourceDescription: 'A browser store satisfies the local-data privacy requirement.',
    commonErrors: [
      'Requirement and element blocks need unique identifiers.',
      'Relationship keywords and arrow spacing are part of the grammar.',
    ],
    relatedGuide: 'privacy-first-sharing',
    keywords: ['traceability', 'compliance', 'requirements'],
    visualKind: 'structure',
  },
  {
    slug: 'gitgraph-starter',
    name: 'Git graph starter',
    diagramType: 'Git graph',
    maturity: 'stable',
    summary: 'Explain a short branch, merge, and release history.',
    useWhen: 'Use a Git graph to teach or document a compact version-control history.',
    source: `gitGraph LR:
  commit id: "scaffold"
  branch feature
  checkout feature
  commit id: "editor"
  checkout main
  merge feature id: "merge"
  commit id: "v1" tag: "v1.0.0"`,
    sourceDescription: 'A feature branch is merged before a tagged release.',
    commonErrors: [
      'Checkout only branches that already exist.',
      'Commit IDs and tags with punctuation should be quoted.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['git', 'branch', 'release'],
    visualKind: 'flow',
  },
  {
    slug: 'info-starter',
    name: 'Mermaid info starter',
    diagramType: 'Mermaid info diagram',
    maturity: 'stable',
    summary: 'Render the exact Mermaid release used by the current Open Mermaid build.',
    useWhen: 'Use the info diagram when a bug report or document needs the renderer version.',
    source: `info`,
    sourceDescription: 'The built-in info diagram reports the pinned Mermaid runtime version.',
    commonErrors: [
      'The info diagram takes no nodes or edges.',
      'Use the reported version together with the source when filing a rendering issue.',
    ],
    relatedGuide: 'mermaid-basics',
    keywords: ['version', 'runtime', 'diagnostics'],
    visualKind: 'structure',
  },
  {
    slug: 'event-modeling-starter',
    name: 'Event modeling starter',
    diagramType: 'Event modeling diagram',
    maturity: 'stable',
    summary: 'Trace a local save as commands, events, interfaces, and read models over time.',
    useWhen:
      'Use event modeling to reason about how user intent changes system state across a timeline.',
    source: `eventmodeling
  tf 01 ui DiagramEditor
  tf 02 cmd SaveDiagram
  tf 03 evt DiagramSaved
  tf 04 rmo LocalLibrary`,
    sourceDescription:
      'A diagram editor issues a save command, records an event, and updates the local library.',
    commonErrors: [
      'Every time frame needs a unique identifier.',
      'Use a supported entity token such as ui, cmd, evt, pcr, or rmo.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['events', 'commands', 'domain', 'timeline'],
    visualKind: 'sequence',
  },
  {
    slug: 'swimlane-starter',
    name: 'Swimlane starter',
    diagramType: 'Swimlane diagram',
    maturity: 'beta',
    summary: 'Show a workflow that crosses author, browser, and review responsibilities.',
    useWhen: 'Use a swimlane diagram when process ownership and handoffs matter together.',
    source: `swimlane-beta LR
  subgraph Author
    draft[Draft source]
    revise[Revise diagram]
  end
  subgraph Browser
    validate{Valid Mermaid?}
    export[Export SVG]
  end
  subgraph Reviewer
    approve[Approve diagram]
  end
  draft --> validate
  validate -->|No| revise --> validate
  validate -->|Yes| approve --> export`,
    sourceDescription:
      'An author and browser iterate until a reviewer approves the diagram for export.',
    commonErrors: [
      'Top-level subgraphs define the lanes and each must end with end.',
      'This Mermaid 11.16 beta syntax may evolve in later releases.',
    ],
    relatedGuide: 'flowcharts',
    keywords: ['ownership', 'handoff', 'process', 'lanes'],
    visualKind: 'flow',
  },
  {
    slug: 'treeview-starter',
    name: 'TreeView starter',
    diagramType: 'TreeView diagram',
    maturity: 'beta',
    summary: 'Present a project or document hierarchy in a familiar file-tree form.',
    useWhen: 'Use TreeView for directories, nested artifacts, and other indented hierarchies.',
    source: `treeView-beta
  open-mermaid/
    src/
      editor.tsx
      renderer.ts
    docs/
      SECURITY.md
    README.md`,
    sourceDescription: 'A compact project tree with source, documentation, and readme files.',
    commonErrors: [
      'Indentation defines parent-child relationships, so keep it consistent.',
      'A trailing slash marks a directory rather than a file.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['files', 'directory', 'hierarchy', 'tree'],
    visualKind: 'structure',
  },
  {
    slug: 'ishikawa-starter',
    name: 'Ishikawa starter',
    diagramType: 'Ishikawa diagram',
    maturity: 'beta',
    summary: 'Organize possible causes of a slow preview into a fishbone analysis.',
    useWhen: 'Use an Ishikawa diagram to explore categories of causes behind one outcome.',
    source: `ishikawa-beta
  Slow preview
    Source
      Oversized labels
      Too many edges
    Browser
      Busy main thread
      Low memory
    Rendering
      Complex layout
      Large SVG`,
    sourceDescription:
      'Potential source, browser, and rendering causes branch toward a slow preview.',
    commonErrors: [
      'The first indented label after the declaration is the effect being analyzed.',
      'Indentation creates the cause hierarchy; mixing levels changes the fishbone.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['fishbone', 'root cause', 'quality', 'analysis'],
    visualKind: 'structure',
  },
  {
    slug: 'venn-starter',
    name: 'Venn diagram starter',
    diagramType: 'Venn diagram',
    maturity: 'beta',
    summary: 'Show where accessible, portable, and editable output needs overlap.',
    useWhen: 'Use a Venn diagram for overlap among a small number of defined sets.',
    source: `venn-beta
  title "Useful diagram output"
  set Accessible
  set Portable
  set Editable
  union Accessible,Portable["Shareable"]
  union Accessible,Portable,Editable["Source plus SVG"]`,
    sourceDescription:
      'Three output qualities overlap, with source plus SVG occupying the shared center.',
    commonErrors: [
      'Declare every set before referring to it in a union.',
      'Use quoted display labels when they contain spaces.',
    ],
    relatedGuide: 'exporting-diagrams',
    keywords: ['sets', 'overlap', 'comparison'],
    visualKind: 'chart',
  },
  {
    slug: 'wardley-starter',
    name: 'Wardley map starter',
    diagramType: 'Wardley map',
    maturity: 'beta',
    summary: 'Place a browser product and its dependencies by visibility and evolution.',
    useWhen: 'Use a Wardley map for value chains, maturity, sourcing, and strategy discussion.',
    source: `wardley-beta
  title Standalone diagram editor
  anchor Diagram author [0.95, 0.85]
  component Editor experience [0.78, 0.68]
  component Mermaid renderer [0.55, 0.72]
  component Browser platform [0.30, 0.92]
  Diagram author -> Editor experience
  Editor experience -> Mermaid renderer
  Mermaid renderer -> Browser platform`,
    sourceDescription:
      'A diagram author depends on the editor, renderer, and increasingly mature browser platform.',
    commonErrors: [
      'Coordinates are visibility first and evolution second, not conventional x then y.',
      'Keep both coordinate values between zero and one.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['strategy', 'maturity', 'value chain', 'map'],
    visualKind: 'chart',
  },
  {
    slug: 'cynefin-starter',
    name: 'Cynefin starter',
    diagramType: 'Cynefin framework diagram',
    maturity: 'beta',
    summary: 'Classify product decisions by how clearly cause and effect can be understood.',
    useWhen: 'Use Cynefin to choose a response style for clear, complex, or chaotic work.',
    source: `cynefin-beta
  title Diagram editor decisions
  complex
    "New interaction pattern"
  complicated
    "Renderer performance tuning"
  clear
    "Run formatting"
  chaotic
    "Active security incident"
  confusion
    "Untriaged browser failure"
  chaotic --> complex : "Stabilized"`,
    sourceDescription: 'Engineering decisions are categorized into five sense-making domains.',
    commonErrors: [
      'Domain names are fixed: complex, complicated, clear, chaotic, and confusion.',
      'Keep item labels quoted and transitions between different domains.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['complexity', 'decision', 'sense making', 'framework'],
    visualKind: 'chart',
  },
  {
    slug: 'railroad-starter',
    name: 'Railroad DSL starter',
    diagramType: 'Railroad syntax diagram',
    maturity: 'beta',
    summary: 'Draw a compact grammar using Mermaid’s explicit railroad construction DSL.',
    useWhen: 'Use the railroad DSL when you want direct control over grammar constructs.',
    source: `railroad-beta
  title "Open Mermaid share fragment"
  share = sequence(terminal("#v1:"), nonterminal("payload")) ;
  payload = oneOrMore(nonterminal("base64url")) ;
  base64url = choice(terminal("A-Z"), terminal("a-z"), terminal("0-9"), terminal("-"), terminal("_")) ;`,
    sourceDescription: 'A share fragment consists of a version prefix and base64url payload.',
    commonErrors: [
      'Every rule ends with a semicolon.',
      'Use explicit terminal and nonterminal constructors in this dialect.',
    ],
    relatedGuide: 'mermaid-basics',
    keywords: ['grammar', 'syntax', 'railroad', 'dsl'],
    visualKind: 'flow',
  },
  {
    slug: 'railroad-ebnf-starter',
    name: 'Railroad EBNF starter',
    diagramType: 'Railroad EBNF diagram',
    maturity: 'beta',
    summary: 'Visualize a small grammar written in Extended Backus–Naur Form.',
    useWhen: 'Use the EBNF dialect when your grammar already uses EBNF operators.',
    source: `railroad-ebnf-beta
  title "Open Mermaid share fragment"
  share = "#v1:" payload ;
  payload = base64url+ ;
  base64url = "A-Z" | "a-z" | "0-9" | "-" | "_" ;`,
    sourceDescription: 'An EBNF grammar for a versioned base64url share fragment.',
    commonErrors: [
      'Every production ends with a semicolon.',
      'Use a vertical bar for alternatives and suffix operators for repetition.',
    ],
    relatedGuide: 'mermaid-basics',
    keywords: ['grammar', 'ebnf', 'railroad', 'syntax'],
    visualKind: 'flow',
  },
  {
    slug: 'railroad-abnf-starter',
    name: 'Railroad ABNF starter',
    diagramType: 'Railroad ABNF diagram',
    maturity: 'beta',
    summary: 'Visualize an internet-style grammar written in Augmented Backus–Naur Form.',
    useWhen: 'Use the ABNF dialect for protocol and standards-oriented grammars.',
    source: `railroad-abnf-beta
  title "Open Mermaid share fragment"
  share = "#v1:" payload ;
  payload = 1*base64url ;
  base64url = ALPHA / DIGIT / "-" / "_" ;`,
    sourceDescription: 'An ABNF grammar for a versioned share fragment and its payload.',
    commonErrors: [
      'ABNF alternatives use a slash rather than a vertical bar.',
      'Rule names may contain hyphens, but every production still needs a semicolon.',
    ],
    relatedGuide: 'mermaid-basics',
    keywords: ['grammar', 'abnf', 'protocol', 'railroad'],
    visualKind: 'flow',
  },
  {
    slug: 'railroad-peg-starter',
    name: 'Railroad PEG starter',
    diagramType: 'Railroad PEG diagram',
    maturity: 'beta',
    summary: 'Visualize a grammar written as parsing expression rules.',
    useWhen: 'Use the PEG dialect when ordered choices and PEG repetition match your parser.',
    source: `railroad-peg-beta
  title "Open Mermaid share fragment"
  share <- "#v1:" payload ;
  payload <- base64url+ ;
  base64url <- "A-Z" / "a-z" / "0-9" / "-" / "_" ;`,
    sourceDescription: 'A PEG grammar for a versioned share fragment and base64url payload.',
    commonErrors: [
      'PEG productions use the left-arrow token rather than an equals sign.',
      'A slash is an ordered choice, so alternative order can matter.',
    ],
    relatedGuide: 'mermaid-basics',
    keywords: ['grammar', 'peg', 'parser', 'railroad'],
    visualKind: 'flow',
  },
  {
    slug: 'incident-triage-recipe',
    name: 'Incident triage recipe',
    diagramType: 'Flowchart recipe',
    maturity: 'stable',
    summary: 'Coordinate detection, severity assessment, mitigation, and follow-up.',
    useWhen:
      'Use this recipe to make the first decisions and handoffs in an incident response explicit.',
    source: `flowchart TD
  Alert([Alert received]) --> Confirm{Real incident?}
  Confirm -->|No| Close[Document and close]
  Confirm -->|Yes| Severity{User impact?}
  Severity -->|High| Page[Page incident lead]
  Severity -->|Low| Queue[Assign responder]
  Page --> Mitigate[Mitigate and communicate]
  Queue --> Mitigate
  Mitigate --> Review[Schedule follow-up review]`,
    sourceDescription:
      'An incident moves from alert confirmation through severity-based response to review.',
    commonErrors: [
      'Do not put credentials, customer names, or private incident details in a shared template.',
      'Label each decision edge so the escalation path is unambiguous.',
    ],
    relatedGuide: 'flowcharts',
    keywords: ['incident', 'operations', 'triage', 'recipe'],
    visualKind: 'flow',
  },
  {
    slug: 'api-retry-recipe',
    name: 'API retry sequence recipe',
    diagramType: 'Sequence diagram recipe',
    maturity: 'stable',
    summary: 'Explain a bounded retry with backoff and a final user-visible failure.',
    useWhen: 'Use this recipe to review which component owns retries and when an operation stops.',
    source: `sequenceDiagram
  autonumber
  participant Client
  participant Service
  Client->>Service: Request
  Service-->>Client: Temporary failure
  loop At most 2 retries
    Client->>Client: Wait with backoff
    Client->>Service: Retry request
    Service-->>Client: Result
  end
  Client-->>Client: Show final status`,
    sourceDescription: 'A client retries a temporary service failure a bounded number of times.',
    commonErrors: [
      'State an actual retry limit; an unbounded loop hides failure behavior.',
      'Document idempotency and timeout details in supporting prose when they affect safety.',
    ],
    relatedGuide: 'sequence-diagrams',
    keywords: ['api', 'retry', 'backoff', 'recipe'],
    visualKind: 'sequence',
  },
  {
    slug: 'release-gate-recipe',
    name: 'Release gate recipe',
    diagramType: 'State diagram recipe',
    maturity: 'stable',
    summary: 'Show which checks can advance or stop a release candidate.',
    useWhen: 'Use this recipe for a compact release lifecycle with an explicit rollback state.',
    source: `stateDiagram-v2
  [*] --> Candidate
  Candidate --> Verified: all gates pass
  Candidate --> Blocked: a gate fails
  Blocked --> Candidate: fix and rebuild
  Verified --> Released: promote artifact
  Released --> RolledBack: critical regression
  Released --> [*]: stable
  RolledBack --> Candidate: prepare correction`,
    sourceDescription:
      'A candidate advances through verification and can return through a rollback path.',
    commonErrors: [
      'A release diagram should show failure and rollback paths, not only the happy path.',
      'Keep the diagram about state; put detailed test commands in the release runbook.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['release', 'quality', 'rollback', 'recipe'],
    visualKind: 'flow',
  },
  {
    slug: 'sankey-starter',
    name: 'Sankey diagram starter',
    diagramType: 'Sankey diagram',
    maturity: 'beta',
    summary: 'Show how visits flow into editing, sharing, and exporting.',
    useWhen: 'Use a Sankey diagram for weighted flow between stages or categories.',
    source: `sankey-beta
Landing,Editor,80
Templates,Editor,45
Editor,Export,70
Editor,Share,30`,
    sourceDescription: 'Weighted paths from discovery pages through editing to output actions.',
    commonErrors: [
      'Each row must contain source, target, and numeric value.',
      'Commas inside names require the escaping rules documented by Mermaid.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['flow', 'weighted', 'analytics'],
    visualKind: 'chart',
  },
  {
    slug: 'xychart-starter',
    name: 'XY chart starter',
    diagramType: 'XY chart',
    maturity: 'beta',
    summary: 'Plot render time measurements across increasing source sizes.',
    useWhen: 'Use an XY chart for values along a continuous or ordered axis.',
    source: `xychart-beta
  title "Render time by source size"
  x-axis "Lines" [10, 50, 100, 250]
  y-axis "Milliseconds" 0 --> 200
  line [12, 30, 62, 145]`,
    sourceDescription: 'A line showing render time as source length grows.',
    commonErrors: [
      'Each series needs the same number of values as the x-axis.',
      'Quote labels that include spaces.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['line', 'bar', 'metrics'],
    visualKind: 'chart',
  },
  {
    slug: 'block-starter',
    name: 'Block diagram starter',
    diagramType: 'Block diagram',
    maturity: 'beta',
    summary: 'Lay out an application boundary and its local components.',
    useWhen: 'Use a block diagram when spatial grouping matters more than message order.',
    source: `block-beta
  columns 2
  A["Source"]
  B["Preview"]
  C["Local store"]
  D["Export"]
  A --> B
  A --> C
  B --> D`,
    sourceDescription: 'Source feeds a preview and local store, while the preview feeds export.',
    commonErrors: [
      'Column spans cannot exceed the declared column count.',
      'Define blocks before referencing them in links.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['system', 'layout', 'components'],
    visualKind: 'structure',
  },
  {
    slug: 'packet-starter',
    name: 'Packet diagram starter',
    diagramType: 'Packet diagram',
    maturity: 'beta',
    summary: 'Document a compact binary message header.',
    useWhen: 'Use a packet diagram for bit ranges and protocol fields.',
    source: `packet-beta
  0-7: "Version"
  8-15: "Flags"
  16-31: "Payload length"
  32-63: "Revision"`,
    sourceDescription: 'A 64-bit header with version, flags, length, and revision fields.',
    commonErrors: [
      'Bit ranges cannot overlap.',
      'Keep ranges in ascending order so the layout is easy to verify.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['protocol', 'binary', 'bits'],
    visualKind: 'structure',
  },
  {
    slug: 'kanban-starter',
    name: 'Kanban starter',
    diagramType: 'Kanban diagram',
    maturity: 'beta',
    summary: 'Track a few documentation tasks through a lightweight board.',
    useWhen: 'Use a Kanban diagram to communicate work state at a point in time.',
    source: `kanban
  Backlog
    docs[Write export guide]
    a11y[Review accessibility]
  Doing
    templates[Add templates]
  Done
    shell[Build editor shell]`,
    sourceDescription: 'Documentation tasks arranged into backlog, doing, and done columns.',
    commonErrors: [
      'Indent task lines beneath their column.',
      'Use unique task IDs even when visible labels are different.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['board', 'tasks', 'workflow'],
    visualKind: 'structure',
  },
  {
    slug: 'architecture-starter',
    name: 'Architecture diagram starter',
    diagramType: 'Architecture diagram',
    maturity: 'beta',
    summary: 'Show the standalone browser boundary and local storage dependency.',
    useWhen: 'Use an architecture diagram for services, groups, and infrastructure links.',
    source: `architecture-beta
  group browser(internet)[Browser]
  service editor(server)[Editor] in browser
  service renderer(server)[Sandboxed renderer] in browser
  service store(database)[IndexedDB] in browser
  editor:R -- L:renderer
  editor:B -- T:store`,
    sourceDescription: 'An editor, renderer, and local database all inside one browser group.',
    commonErrors: [
      'Connection sides use the supported T, B, L, and R markers.',
      'A service can reference a group only after the group is declared.',
    ],
    relatedGuide: 'privacy-first-sharing',
    keywords: ['infrastructure', 'system', 'services'],
    visualKind: 'structure',
  },
  {
    slug: 'mindmap-starter',
    name: 'Mindmap starter',
    diagramType: 'Mindmap',
    maturity: 'experimental',
    summary: 'Explore the features around a browser-based diagram workspace.',
    useWhen: 'Use a mindmap for informal exploration and hierarchical brainstorming.',
    source: `mindmap
  root((Open Mermaid))
    Create
      Templates
      Live preview
    Keep local
      Browser storage
      Source files
    Share
      Fragment link
      SVG and PNG`,
    sourceDescription: 'Open Mermaid features grouped into create, local, and share branches.',
    commonErrors: [
      'Indentation defines the hierarchy.',
      'Avoid mixing tabs and spaces in the same tree.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['brainstorm', 'tree', 'ideas'],
    visualKind: 'structure',
  },
  {
    slug: 'timeline-starter',
    name: 'Timeline starter',
    diagramType: 'Timeline',
    maturity: 'experimental',
    summary: 'Tell the story of a small product release in chronological order.',
    useWhen: 'Use a timeline for milestones and events where exact durations are secondary.',
    source: `timeline
  title Open Mermaid v1
  Plan : Define the independence contract
  Build : Create the local editor
        : Add safe exports
  Verify : Test browsers and accessibility
  Release : Publish static files`,
    sourceDescription: 'A release progresses from planning through building and verification.',
    commonErrors: [
      'Events without a period must align beneath the previous period.',
      'Use a Gantt chart instead when duration and dependency are essential.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['history', 'milestones', 'chronology'],
    visualKind: 'flow',
  },
  {
    slug: 'c4-starter',
    name: 'C4 context starter',
    diagramType: 'C4 diagram',
    maturity: 'experimental',
    summary: 'Place the standalone application in its user and browser context.',
    useWhen: 'Use C4 syntax for a software-architecture view at a defined level of detail.',
    source: `C4Context
  title System context for Open Mermaid
  Person(author, "Diagram author", "Creates Mermaid diagrams")
  System(openmermaid, "Open Mermaid", "Static browser application")
  System_Ext(browserStore, "Browser storage", "Keeps local documents")
  Rel(author, openmermaid, "Creates diagrams with")
  Rel(openmermaid, browserStore, "Stores documents in")`,
    sourceDescription: 'A diagram author uses Open Mermaid, which stores documents in the browser.',
    commonErrors: [
      'C4 identifiers must be unique within the diagram.',
      'This syntax is experimental upstream and can change between Mermaid releases.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['c4', 'context', 'architecture'],
    visualKind: 'structure',
  },
  {
    slug: 'radar-starter',
    name: 'Radar chart starter',
    diagramType: 'Radar chart',
    maturity: 'beta',
    summary: 'Compare two options across a compact set of named dimensions.',
    useWhen: 'Use a radar chart carefully for multivariate profiles with the same scale.',
    source: `radar-beta
  title Diagram formats
  axis fidelity, size, portability, editability
  curve svg{5, 4, 5, 3}
  curve png{4, 2, 4, 1}
  max 5
  min 0`,
    sourceDescription: 'SVG and PNG compared across fidelity, size, portability, and editability.',
    commonErrors: [
      'Every curve needs one value for every axis.',
      'All dimensions should use a comparable scale.',
    ],
    relatedGuide: 'exporting-diagrams',
    keywords: ['multivariate', 'comparison', 'chart'],
    visualKind: 'chart',
  },
  {
    slug: 'treemap-starter',
    name: 'Treemap starter',
    diagramType: 'Treemap',
    maturity: 'beta',
    summary: 'Show a hierarchical allocation of documentation topics.',
    useWhen: 'Use a treemap for hierarchical part-to-whole data with non-negative sizes.',
    source: `treemap-beta
  "Documentation"
    "Guides": 40
    "Templates": 35
    "Policies": 25`,
    sourceDescription: 'Documentation space divided among guides, templates, and policies.',
    commonErrors: [
      'Child rows must be indented under their parent.',
      'Values should be non-negative and use one consistent unit.',
    ],
    relatedGuide: 'choosing-a-diagram',
    keywords: ['hierarchy', 'allocation', 'area'],
    visualKind: 'chart',
  },
] as const;

export const stableTemplates = diagramTemplates.filter(
  (template) => template.maturity === 'stable',
);

export function getTemplate(slug: string): DiagramTemplate | undefined {
  return diagramTemplates.find((template) => template.slug === slug);
}
