import { describe, expect, it } from 'vitest';

import { isSanitizedSvg, sanitizeSvg, UnsafeSvgError } from '../../../src/lib/rendering/sanitize';

const maliciousSvgCorpus = [
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><text>safe</text></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>link</text></a></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://attacker.invalid/pixel.png"/><text>safe</text></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1) />unsafe</div></foreignObject></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://attacker.invalid/a.css); text { fill: red }</style><text>safe</text></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://attacker.invalid/pixel)" width="10" height="10"/></svg>',
  String.raw`<svg xmlns="http://www.w3.org/2000/svg"><style>rect { fill: u\72l(https://attacker.invalid/escaped) }</style><rect width="10" height="10"/></svg>`,
  '<svg xmlns="http://www.w3.org/2000/svg"><style>rect { fill: u/**/rl(https://attacker.invalid/comment) }</style><rect width="10" height="10"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><rect style="background-image:image-set(https://attacker.invalid/pixel 1x)" width="10" height="10"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><feImage xlink:href="https://attacker.invalid/filter.svg" /></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="href" to="javascript:alert(1)" /></svg>',
];

describe('sanitizeSvg malicious-input corpus', () => {
  it.each(maliciousSvgCorpus)('removes executable and network-capable output %#', (input) => {
    const result = sanitizeSvg(input);

    expect(isSanitizedSvg(result)).toBe(true);
    expect(result.markup).not.toMatch(
      /<script|<iframe|<object|<embed|<image|<feImage|<foreignObject|<animate|<set/iu,
    );
    expect(result.markup).not.toMatch(/\son[a-z]+\s*=/iu);
    expect(result.markup).not.toMatch(/javascript\s*:|vbscript\s*:|@import/iu);
    expect(result.markup).not.toContain('attacker.invalid');
  });

  it('preserves local SVG marker references and accessible text', () => {
    const result = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" role="img" aria-labelledby="title desc">
        <title id="title">Checkout flow</title>
        <desc id="desc">A safe diagram description.</desc>
        <defs><marker id="arrow"><path d="M0,0 L10,5 L0,10 z" /></marker></defs>
        <path d="M0,0 L50,50" marker-end="url(#arrow)" />
      </svg>
    `);

    expect(result.markup).toContain('marker-end="url(#arrow)"');
    expect(result.markup).toContain('aria-labelledby="title desc"');
    expect(result.markup).toContain('Checkout flow');
  });

  it('rejects non-SVG and oversized output', () => {
    expect(() => sanitizeSvg('<p>not svg</p>')).toThrow(UnsafeSvgError);
    expect(() =>
      sanitizeSvg(
        `<svg xmlns="http://www.w3.org/2000/svg"><text>${'x'.repeat(2_000_001)}</text></svg>`,
      ),
    ).toThrow(/exceeds/iu);
  });
});
