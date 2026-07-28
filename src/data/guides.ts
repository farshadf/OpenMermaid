export interface GuideSection {
  heading: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
}

export interface DiagramGuide {
  slug: string;
  title: string;
  description: string;
  readingMinutes: number;
  source: string;
  sourceDescription: string;
  visualKind: 'flow' | 'sequence' | 'chart' | 'structure';
  sections: readonly GuideSection[];
  commonErrors: readonly string[];
  relatedTemplates: readonly string[];
  updatedAt: string;
}

export const guides: readonly DiagramGuide[] = [
  {
    slug: 'mermaid-basics',
    title: 'Mermaid basics: from text to diagram',
    description:
      'Learn the small set of habits that make Mermaid diagrams easy to write and maintain.',
    readingMinutes: 6,
    source: `flowchart TD
  Idea[Write the idea] --> Syntax[Choose a diagram type]
  Syntax --> Preview[Check the preview]
  Preview --> Valid{Looks right?}
  Valid -->|No| Syntax
  Valid -->|Yes| Export[Share or export]`,
    sourceDescription: 'A beginner workflow from an idea to a checked export.',
    visualKind: 'flow',
    sections: [
      {
        heading: 'Start with the relationship you need to explain',
        paragraphs: [
          'Mermaid turns a plain-text description into a diagram. The first line selects a diagram grammar, such as flowchart, sequenceDiagram, or classDiagram. The lines that follow describe nodes, messages, or data for that grammar.',
          'Write the smallest useful diagram first. Add one relationship at a time and let the live validator identify the line that needs attention. Short IDs and clear visible labels make later edits easier.',
        ],
      },
      {
        heading: 'Keep source readable',
        paragraphs: [
          'Whitespace and indentation do not mean the same thing in every grammar, but consistent formatting helps people review the source. Use one concept per line, stable IDs, and comments for decisions that are not obvious from the visual.',
        ],
        bullets: [
          'Give every concept a unique, durable ID.',
          'Quote labels that contain punctuation or grammar characters.',
          'Prefer several focused diagrams over one dense canvas.',
          'Add accTitle and accDescr metadata when the grammar supports it.',
        ],
      },
      {
        heading: 'Validation and preview are separate checks',
        paragraphs: [
          'Valid syntax can still produce a diagram that is hard to understand. After the parser accepts the source, check reading order, contrast, labels, and whether the diagram still works at narrow widths. Preserve the source because it is often more accessible than the generated graphic.',
        ],
      },
    ],
    commonErrors: [
      'Starting with an unsupported or misspelled diagram declaration.',
      'Using the same ID for unrelated concepts.',
      'Pasting Markdown fences into an editor that expects only Mermaid source.',
    ],
    relatedTemplates: ['flowchart-starter', 'sequence-starter', 'class-starter'],
    updatedAt: '2026-07-21',
  },
  {
    slug: 'flowcharts',
    title: 'Build clear Mermaid flowcharts',
    description:
      'Choose direction, shapes, labels, and branches that remain understandable as a process grows.',
    readingMinutes: 7,
    source: `flowchart LR
  Report[Issue reported] --> Reproduce{Can reproduce?}
  Reproduce -->|No| Ask[Request details]
  Ask --> Report
  Reproduce -->|Yes| Fix[Implement fix]
  Fix --> Verify{Tests pass?}
  Verify -->|No| Fix
  Verify -->|Yes| Close([Close issue])`,
    sourceDescription: 'An issue-resolution flow with labeled decisions and bounded loops.',
    visualKind: 'flow',
    sections: [
      {
        heading: 'Pick a direction that matches the story',
        paragraphs: [
          'Top-to-bottom layouts work well for procedures and narrow screens. Left-to-right layouts fit compact pipelines and timelines. Direction is a reading-order decision, not decoration, so choose it before a graph becomes crowded.',
        ],
      },
      {
        heading: 'Use shapes consistently',
        paragraphs: [
          'A rectangle can represent an action, a diamond a decision, and a rounded terminal a start or end. Consistency lets readers scan the diagram without decoding every node from scratch.',
        ],
        bullets: [
          'Label decision edges with the answer or condition.',
          'Keep node text short and put supporting detail in nearby prose.',
          'Break cross-cutting processes into linked diagrams.',
        ],
      },
      {
        heading: 'Control complexity',
        paragraphs: [
          'If many edges cross or a node has several unrelated responsibilities, split the flow by stage. Subgraphs can clarify real boundaries, but too many nested boxes add noise. Test the result at the size where it will actually be read.',
        ],
      },
    ],
    commonErrors: [
      'An unlabeled decision branch forces readers to guess what each path means.',
      'IDs that contain spaces or grammar characters can be parsed differently than expected.',
      'Click directives are intentionally constrained by strict security settings.',
    ],
    relatedTemplates: ['flowchart-starter', 'state-starter', 'gitgraph-starter'],
    updatedAt: '2026-07-21',
  },
  {
    slug: 'sequence-diagrams',
    title: 'Explain interactions with sequence diagrams',
    description: 'Make actors, calls, responses, loops, and alternatives easy to follow.',
    readingMinutes: 7,
    source: `sequenceDiagram
  autonumber
  actor Author
  participant Editor
  participant Renderer
  Author->>Editor: Change source
  Editor->>Renderer: Render revision 8
  alt Valid source
    Renderer-->>Editor: Sanitized preview
    Editor-->>Author: Show revision 8
  else Syntax error
    Renderer-->>Editor: Diagnostic
    Editor-->>Author: Keep last valid preview
  end`,
    sourceDescription:
      'The editor handles valid and invalid renderer responses without losing the last preview.',
    visualKind: 'sequence',
    sections: [
      {
        heading: 'Name participants for the reader',
        paragraphs: [
          'Declare participants in the order that supports a natural left-to-right conversation. Aliases let you keep a compact source ID while showing a clear display name. Use actor when a person or external role is meaningfully different from a system participant.',
        ],
      },
      {
        heading: 'Separate calls from responses',
        paragraphs: [
          'Solid and dotted arrows can distinguish requests from responses. This convention is useful only when you apply it consistently. Autonumber can make a busy interaction easier to discuss in prose and reviews.',
        ],
      },
      {
        heading: 'Use control blocks with restraint',
        paragraphs: [
          'alt, opt, loop, and par blocks explain meaningful control flow. Give each branch a specific condition and keep nesting shallow. When state becomes more important than message order, a state diagram may communicate the idea better.',
        ],
      },
    ],
    commonErrors: [
      'A message targets a participant ID that was never declared.',
      'An alt, loop, or critical block is missing its closing end.',
      'Long message labels make lifelines too wide on mobile screens.',
    ],
    relatedTemplates: ['sequence-starter', 'state-starter', 'flowchart-starter'],
    updatedAt: '2026-07-21',
  },
  {
    slug: 'choosing-a-diagram',
    title: 'Choose the right Mermaid diagram',
    description: 'Match the question you are answering to a diagram grammar before writing syntax.',
    readingMinutes: 8,
    source: `flowchart TD
  Question{What matters most?}
  Question -->|Order of messages| Sequence[Sequence diagram]
  Question -->|Process or decision| Flow[Flowchart]
  Question -->|Lifecycle| State[State diagram]
  Question -->|Data relationships| ER[ER diagram]
  Question -->|Values over an axis| XY[XY chart]`,
    sourceDescription: 'A decision tree matching five common questions to diagram types.',
    visualKind: 'flow',
    sections: [
      {
        heading: 'Begin with the reader’s question',
        paragraphs: [
          'A good diagram removes uncertainty about one kind of relationship. Processes need paths, conversations need time order, domain models need structure, and measurements need honest scales. Selecting a grammar by appearance alone usually creates extra explanation work.',
        ],
      },
      {
        heading: 'A practical matching guide',
        paragraphs: ['Use the narrowest diagram type that expresses the important relationship.'],
        bullets: [
          'Flowchart: decisions, procedures, and dependency paths.',
          'Sequence: messages and ownership over time.',
          'State: valid lifecycle transitions.',
          'Class or ER: structure and relationships.',
          'Gantt or timeline: scheduled work or milestones.',
          'XY, pie, radar, Sankey, or treemap: quantitative comparisons with appropriate scales.',
        ],
      },
      {
        heading: 'Treat upstream maturity as a maintenance signal',
        paragraphs: [
          'Mermaid labels some grammars beta or experimental. Open Mermaid makes those labels visible because syntax and output can change between pinned Mermaid releases. Keep source under version control and revalidate experimental diagrams before upgrading Mermaid.',
        ],
      },
    ],
    commonErrors: [
      'Using a timeline when exact duration and dependencies require a Gantt chart.',
      'Using a pie chart for values that are not parts of one whole.',
      'Forcing a dense system model into a flowchart when a structural grammar would be clearer.',
    ],
    relatedTemplates: ['flowchart-starter', 'sequence-starter', 'er-starter', 'xychart-starter'],
    updatedAt: '2026-07-21',
  },
  {
    slug: 'accessible-diagrams',
    title: 'Make Mermaid diagrams more accessible',
    description: 'Pair a readable source and text explanation with a carefully labeled visual.',
    readingMinutes: 8,
    source: `flowchart LR
  Source[Readable source text] --> Title[Meaningful title]
  Title --> Description[Concise description]
  Description --> Visual[Checked visual output]
  Visual --> Context[Supporting prose]`,
    sourceDescription:
      'Accessible publishing combines source, title, description, visual output, and prose.',
    visualKind: 'flow',
    sections: [
      {
        heading: 'A generated graphic is not automatically accessible',
        paragraphs: [
          'Mermaid can add accessible title and description metadata, but authors still decide whether wording, order, color, density, and surrounding context work for their audience. Open Mermaid preserves source and prompts for accTitle and accDescr; it cannot guarantee arbitrary user-authored diagrams meet an accessibility standard.',
        ],
      },
      {
        heading: 'Provide an equivalent route to the information',
        paragraphs: [
          'Keep the source available when publishing and add a short prose explanation of the conclusion the diagram supports. For complex data, a table or ordered list may be a better equivalent than a long image description.',
        ],
        bullets: [
          'Use a unique, meaningful diagram title.',
          'Describe the purpose and conclusion, not every decorative detail.',
          'Do not rely on color alone for status or direction.',
          'Check zoom, forced colors, narrow layouts, and keyboard reading order.',
        ],
      },
      {
        heading: 'Test the exported context',
        paragraphs: [
          'An SVG embedded in a web page behaves differently from a PNG pasted into a document. Check the final publishing surface, preserve sufficient contrast against its background, and keep a text alternative next to raster exports.',
        ],
      },
    ],
    commonErrors: [
      'Claiming conformance based only on an automated scan.',
      'Using generic alternative text such as “diagram” without its purpose.',
      'Removing the source and explanation after exporting a raster image.',
    ],
    relatedTemplates: ['flowchart-starter', 'journey-starter', 'sequence-starter'],
    updatedAt: '2026-07-21',
  },
  {
    slug: 'privacy-first-sharing',
    title: 'Share Mermaid source with privacy in mind',
    description: 'Understand what an Open Mermaid fragment link contains before you copy it.',
    readingMinutes: 6,
    source: `flowchart LR
  Source[Diagram source] --> Compress[Compress locally]
  Compress --> Fragment[URL fragment]
  Fragment --> Recipient[Recipient opens link]
  Recipient --> Decode[Decode locally]`,
    sourceDescription:
      'Diagram source is compressed into a fragment and decoded in the recipient’s browser.',
    visualKind: 'flow',
    sections: [
      {
        heading: 'A fragment avoids one network path, not every exposure',
        paragraphs: [
          'Open Mermaid snapshot links put compressed diagram data after the # character. Browsers normally omit that fragment from the HTTP request, so a static host does not need the source to deliver the page. The link is still readable data, not encryption.',
        ],
      },
      {
        heading: 'Treat the entire link like the document',
        paragraphs: [
          'Recipients, browser history, clipboard utilities, password managers, screenshots, screen sharing, extensions, and any application where you paste the link may see the fragment. Do not use fragment sharing for secrets or regulated content unless your own policy explicitly allows it.',
        ],
        bullets: [
          'Review the source before creating a snapshot.',
          'Remove credentials, tokens, personal data, and confidential names.',
          'Prefer a local .mmd file and an approved secure channel for sensitive material.',
          'Remember that an immutable snapshot does not update when the local document changes.',
        ],
      },
      {
        heading: 'Local is the default boundary',
        paragraphs: [
          'The standalone application stores documents in the browser. Diagram content leaves the local workspace only when the user explicitly shares, exports, copies, uploads, or pastes it somewhere else. A deployment may separately offer opt-in aggregate template-use reporting, but that report contains only an allowlisted template identifier and never the diagram or document metadata.',
        ],
      },
    ],
    commonErrors: [
      'Describing a compressed fragment as encrypted.',
      'Assuming deleting local history invalidates copies already sent to other people.',
      'Sharing a link through a service without considering that service’s retention policy.',
    ],
    relatedTemplates: ['requirement-starter', 'architecture-starter', 'flowchart-starter'],
    updatedAt: '2026-07-21',
  },
  {
    slug: 'exporting-diagrams',
    title: 'Choose SVG or PNG for a Mermaid export',
    description: 'Select a format, scale, and background that fit the destination.',
    readingMinutes: 6,
    source: `flowchart TD
  Need{Where will it go?}
  Need -->|Web or design tool| SVG[Export sanitized SVG]
  Need -->|Document or chat| PNG[Export PNG]
  PNG --> Scale{Need more pixels?}
  Scale -->|Normal| One[1x]
  Scale -->|High density| Two[2x or 3x]`,
    sourceDescription: 'A decision flow for selecting SVG or a scaled PNG.',
    visualKind: 'flow',
    sections: [
      {
        heading: 'Prefer SVG when the destination supports it',
        paragraphs: [
          'SVG remains crisp at different sizes and keeps text as vector content. Open Mermaid exports only its sanitized renderer output. Some publishing systems rewrite or rasterize SVG, so verify the actual destination rather than assuming every viewer behaves the same.',
        ],
      },
      {
        heading: 'Use PNG for broad compatibility',
        paragraphs: [
          'PNG is a fixed-size raster image. Choose 1x for ordinary screen use and 2x or 3x when a high-density display or larger placement needs more pixels. Higher scale increases memory use and file size; it does not add information to a dense source diagram.',
        ],
        bullets: [
          'Transparent backgrounds work when the destination provides reliable contrast.',
          'Use an explicit light or dark background for presentations and documents.',
          'Keep a source .mmd file so the diagram remains editable.',
          'Check labels at the final displayed size.',
        ],
      },
      {
        heading: 'Export is a deliberate data action',
        paragraphs: [
          'Downloaded source and images leave browser-managed storage and follow the security and backup rules of the destination device. Review file names and diagram content before sending either format to another service.',
        ],
      },
    ],
    commonErrors: [
      'Using a transparent background when text loses contrast on the destination.',
      'Assuming a 3x PNG makes small source labels easier to understand at the same display size.',
      'Discarding the editable source after exporting an image.',
    ],
    relatedTemplates: ['flowchart-starter', 'radar-starter', 'sequence-starter'],
    updatedAt: '2026-07-21',
  },
] as const;

export function getGuide(slug: string): DiagramGuide | undefined {
  return guides.find((guide) => guide.slug === slug);
}
