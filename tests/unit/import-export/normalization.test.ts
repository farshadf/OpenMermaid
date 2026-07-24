import mermaid from 'mermaid';
import { describe, expect, it } from 'vitest';

import {
  MAX_MERMAID_NORMALIZATION_INPUT_LENGTH,
  MermaidSourceNormalizationError,
  looksLikeMermaidSource,
  normalizeMermaidSource,
} from '@lib/import-export';

function changeCodes(source: string) {
  return normalizeMermaidSource(source).report.changes.map(({ code }) => code);
}

describe('external Mermaid source normalization', () => {
  it('leaves ordinary source and meaningful typography unchanged', () => {
    const source = 'flowchart LR\n  A[“Q1–Q2 👩‍💻”] --> B[Done]';
    const normalized = normalizeMermaidSource(source);

    expect(normalized.source).toBe(source);
    expect(normalized.report).toMatchObject({
      changed: false,
      wrapper: 'none',
      changes: [],
    });
    expect(normalized.report.warnings).toContainEqual({
      code: 'suspicious-formatting-control',
      count: 1,
    });
  });

  it('extracts ChatGPT-style fenced output through Markdown blockquotes', async () => {
    const pasted = [
      '> Here is the requested diagram:',
      '> ``` Mermaid',
      '> flowchart LR',
      '>   Prompt --> Diagram',
      '> ```',
    ].join('\r\n');
    const normalized = normalizeMermaidSource(pasted);

    expect(normalized.source).toBe('flowchart LR\n  Prompt --> Diagram');
    expect(normalized.report.wrappers).toContain('markdown-fence');
    expect(changeCodes(pasted)).toEqual(
      expect.arrayContaining([
        'line-ending',
        'markdown-blockquote-prefix',
        'markdown-fence-wrapper',
      ]),
    );
    await expect(mermaid.parse(normalized.source, { suppressErrors: false })).resolves.toBeTruthy();
  });

  it('accepts mmd, language-mermaid, attribute, and clearly Mermaid generic fences', () => {
    const wrappers = [
      '```mmd\nflowchart LR\n  A --> B\n```',
      '```language-mermaid\nflowchart LR\n  A --> B\n```',
      '```{.mermaid}\nflowchart LR\n  A --> B\n```',
      '```\nflowchart LR\n  A --> B\n```',
    ];

    for (const wrapper of wrappers) {
      expect(normalizeMermaidSource(wrapper)).toMatchObject({
        source: 'flowchart LR\n  A --> B',
        report: { changed: true, wrapper: 'markdown-fence' },
      });
    }

    const javascript = '```js\nflowchart LR\n  A --> B\n```';
    expect(normalizeMermaidSource(javascript).source).toBe(javascript);
  });

  it('recovers an incomplete explicitly labeled fence and reports the ambiguity', () => {
    const normalized = normalizeMermaidSource('```mermaid\nflowchart LR\n  A --> B');
    expect(normalized.source).toBe('flowchart LR\n  A --> B');
    expect(normalized.report.warnings).toContainEqual({
      code: 'incomplete-mermaid-fence',
      count: 1,
    });
  });

  it('selects the first Mermaid block and reports additional blocks', () => {
    const normalized = normalizeMermaidSource(
      '```mermaid\nflowchart LR\n  A --> B\n```\n\n```mmd\nsequenceDiagram\n  A->>B: Hi\n```',
    );
    expect(normalized.source).toBe('flowchart LR\n  A --> B');
    expect(normalized.report.warnings).toContainEqual({
      code: 'multiple-mermaid-blocks',
      count: 1,
    });
  });

  it('unwraps text-only HTML code copied from rendered tools and decodes it safely', async () => {
    const normalized = normalizeMermaidSource(
      '<pre><code class="language-mermaid">flowchart LR\n  A --&gt; B[&quot;Done&quot;]</code></pre>',
    );
    expect(normalized.source).toBe('flowchart LR\n  A --> B["Done"]');
    expect(normalized.report.wrapper).toBe('html-code');
    await expect(mermaid.parse(normalized.source, { suppressErrors: false })).resolves.toBeTruthy();
  });

  it('does not strip arbitrary markup from a syntax-highlighted HTML wrapper', () => {
    const wrapper = '<pre><code class="language-mermaid"><span>flowchart LR</span></code></pre>';
    const normalized = normalizeMermaidSource(wrapper);
    expect(normalized.source).toBe(wrapper);
    expect(normalized.report.warnings).toContainEqual({
      code: 'unrecognized-html-wrapper',
      count: 1,
    });
  });

  it('unwraps a JSON string only when its decoded value is identifiable Mermaid', () => {
    const diagram = 'sequenceDiagram\n  User->>Browser: Paste';
    expect(normalizeMermaidSource(JSON.stringify(diagram))).toMatchObject({
      source: diagram,
      report: { changed: true, wrapper: 'json-string' },
    });
    expect(normalizeMermaidSource(JSON.stringify('ordinary prose')).source).toBe(
      JSON.stringify('ordinary prose'),
    );
  });

  it('unwraps known source fields from tool-call JSON without trusting arbitrary fields', () => {
    const diagram = 'flowchart LR\n  Tool --> Result';
    expect(normalizeMermaidSource(JSON.stringify({ id: 'call-1', source: diagram }))).toMatchObject(
      {
        source: diagram,
        report: { changed: true, wrapper: 'json-object' },
      },
    );
    const unrelated = JSON.stringify({ source: 'ordinary prose', code: 'console.log(1)' });
    expect(normalizeMermaidSource(unrelated).source).toBe(unrelated);
  });

  it('decodes escaped line breaks only for a one-line value that begins as Mermaid', () => {
    expect(normalizeMermaidSource('flowchart LR\\n  A --> B\\n  B --> C').source).toBe(
      'flowchart LR\n  A --> B\n  B --> C',
    );
    const label = 'flowchart LR\n  A[Keep \\n as text] --> B';
    expect(normalizeMermaidSource(label).source).toBe(label);
  });

  it('removes monotonically increasing copied line numbers', async () => {
    const normalized = normalizeMermaidSource(
      '41 | flowchart TD\n42 |   Start --> Finish\n43 |   Finish --> Done',
    );
    expect(normalized.source).toBe('flowchart TD\n  Start --> Finish\n  Finish --> Done');
    expect(changeCodes('41 | flowchart TD\n42 |   Start --> Finish')).toContain(
      'line-number-prefix',
    );
    await expect(mermaid.parse(normalized.source, { suppressErrors: false })).resolves.toBeTruthy();
  });

  it('dedents indented code blocks and removes known prose or language prefixes', () => {
    expect(normalizeMermaidSource('    flowchart LR\n      A --> B').source).toBe(
      'flowchart LR\n  A --> B',
    );
    expect(
      normalizeMermaidSource('Here is the Mermaid diagram:\nflowchart LR\n  A --> B').source,
    ).toBe('flowchart LR\n  A --> B');
    expect(normalizeMermaidSource('mermaid:\nflowchart LR\n  A --> B').source).toBe(
      'flowchart LR\n  A --> B',
    );
  });

  it('removes nested quote, list, diff, terminal-gutter, and ANSI presentation prefixes', () => {
    const cases = [
      '>> flowchart LR\n>>   A --> B',
      '- flowchart LR\n-   A --> B',
      '+ flowchart LR\n+   A --> B',
      '│ flowchart LR\n│   A --> B',
      '\u001B[32mflowchart LR\u001B[0m\n  A --> B',
    ];
    for (const wrapped of cases) {
      expect(normalizeMermaidSource(wrapped).source).toBe('flowchart LR\n  A --> B');
    }
  });

  it('repairs transport controls, non-breaking spaces, entities, and structural smart dashes', async () => {
    const input = '\uFEFFflowchart\u00A0LR\u2028  A \u2014\u2014> B\u0000\n  B --&gt; C';
    const normalized = normalizeMermaidSource(input);
    expect(normalized.source).toBe('flowchart LR\n  A --> B\n  B --> C');
    expect(normalized.report.changes.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'byte-order-mark',
        'non-breaking-space',
        'unicode-line-separator',
        'control-character',
        'structural-smart-dash',
        'structural-html-entity',
      ]),
    );
    await expect(mermaid.parse(normalized.source, { suppressErrors: false })).resolves.toBeTruthy();
  });

  it('does not decode entity text or smart dashes inside ordinary labels', () => {
    const source = 'flowchart LR\n  A[5 &gt; 3] --> B[Q1–Q2]';
    expect(normalizeMermaidSource(source).source).toBe(source);
  });

  it('reports Unicode arrows instead of guessing their Mermaid semantics', () => {
    const source = 'sequenceDiagram\n  A → B: ambiguous arrow';
    const normalized = normalizeMermaidSource(source);
    expect(normalized.source).toBe(source);
    expect(normalized.report.warnings).toContainEqual({
      code: 'unicode-arrow-left-unchanged',
      count: 1,
    });
  });

  it('recognizes versioned diagram directives and rejects ordinary text', () => {
    for (const source of [
      'flowchart LR\n  A --> B',
      'graph TD\n  A --> B',
      'sequenceDiagram\n  A->>B: Hi',
      'architecture-beta\n  service api(server)[API]',
      '---\ntitle: Accessible\n---\nflowchart LR\n  A --> B',
    ]) {
      expect(looksLikeMermaidSource(source)).toBe(true);
    }
    expect(looksLikeMermaidSource('Here is a diagram.')).toBe(false);
  });

  it('bounds preprocessing before applying wrapper heuristics', () => {
    expect(() =>
      normalizeMermaidSource('x'.repeat(MAX_MERMAID_NORMALIZATION_INPUT_LENGTH + 1)),
    ).toThrow(MermaidSourceNormalizationError);
  });
});
