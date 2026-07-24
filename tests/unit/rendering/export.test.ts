import { describe, expect, it } from 'vitest';

import {
  createPngBlob,
  createSvgBlob,
  measureSvg,
  normalizeExportFilename,
} from '../../../src/lib/rendering/export';
import { sanitizeSvg } from '../../../src/lib/rendering/sanitize';

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener(
      'load',
      () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Expected FileReader to produce text.'));
        }
      },
      { once: true },
    );
    reader.addEventListener(
      'error',
      () => reject(reader.error ?? new Error('Could not read Blob.')),
      { once: true },
    );
    reader.readAsText(blob);
  });
}

describe('SVG and PNG export inputs', () => {
  it('measures the viewBox used for scaled PNG output', () => {
    const svg = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 640 360"><text>Diagram</text></svg>',
    );

    expect(measureSvg(svg)).toEqual({ width: 640, height: 360 });
  });

  it('falls back to explicit pixel dimensions', () => {
    const svg = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800px" height="600px"><text>Diagram</text></svg>',
    );

    expect(measureSvg(svg)).toEqual({ width: 800, height: 600 });
  });

  it('creates only sanitized SVG blobs and portable filenames', async () => {
    const svg = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Safe</text></svg>',
    );
    const blob = createSvgBlob(svg);

    expect(blob.type).toBe('image/svg+xml;charset=utf-8');
    await expect(readBlob(blob)).resolves.toContain('<text>Safe</text>');
    expect(normalizeExportFilename('../Quarter: plan?.SVG', 'svg')).toBe('Quarter- plan.svg');
    expect(normalizeExportFilename('  ', 'png')).toBe('diagram.png');
  });

  it('rejects unsupported PNG settings at runtime', async () => {
    const svg = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Safe</text></svg>',
    );

    await expect(createPngBlob(svg, { scale: 4 as 1, background: 'transparent' })).rejects.toThrow(
      /not supported/iu,
    );
  });
});
