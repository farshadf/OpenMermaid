import { zlibSync } from 'fflate';

import { type ShareEnvelopeV1 } from '@lib/documents';
import {
  MAX_SHARE_DECOMPRESSED_BYTES,
  MAX_SHARE_HASH_LENGTH,
  decodeShareHash,
  encodeShareHash,
} from '@lib/share';
import { describe, expect, it } from 'vitest';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64Url(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += ALPHABET.charAt(first >> 2);
    result += ALPHABET.charAt(((first & 3) << 4) | ((second ?? 0) >> 4));
    if (second !== undefined) result += ALPHABET.charAt(((second & 15) << 2) | ((third ?? 0) >> 6));
    if (third !== undefined) result += ALPHABET.charAt(third & 63);
  }
  return result;
}

function rawHash(value: unknown): string {
  return `#v1:${base64Url(zlibSync(new TextEncoder().encode(JSON.stringify(value))))}`;
}

const envelope: ShareEnvelopeV1 = {
  version: 1,
  title: 'Unicode 🌊 diagram',
  source: 'flowchart LR\n  A["مرحبا"] --> B["日本語"]',
  createdWithMermaid: '11.16.0',
  appearance: { theme: 'dark', background: 'transparent' },
};

describe('share URL codec', () => {
  it('round-trips Unicode and accepts a complete URL', () => {
    const hash = encodeShareHash(envelope);
    expect(hash).toMatch(/^#v1:[A-Za-z0-9_-]+$/u);
    expect(decodeShareHash(hash)).toEqual(envelope);
    expect(decodeShareHash(`https://openmermaid.example/editor/${hash}`)).toEqual(envelope);
  });

  it.each([
    ['', 'missing_fragment'],
    ['#other', 'malformed_fragment'],
    ['#v1:not+base64', 'malformed_fragment'],
    ['#v1:eA', 'malformed_fragment'],
    ['#v2:anything', 'unsupported_version'],
  ])('rejects unsafe fragment %s', (hash, code) => {
    expect(() => decodeShareHash(hash)).toThrow(expect.objectContaining({ code }));
  });

  it('rejects a future envelope inside the current transport', () => {
    expect(() => decodeShareHash(rawHash({ ...envelope, version: 2 }))).toThrow(
      expect.objectContaining({ code: 'unsupported_version' }),
    );
  });

  it('rejects unexpected envelope and appearance properties', () => {
    expect(() => decodeShareHash(rawHash({ ...envelope, unexpected: true }))).toThrow(
      expect.objectContaining({ code: 'malformed_fragment' }),
    );
    expect(() =>
      decodeShareHash(
        rawHash({
          ...envelope,
          appearance: { ...envelope.appearance, remoteUrl: 'https://x.test' },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'malformed_fragment' }));
  });

  it('stops a highly compressed decompression bomb at the output limit', () => {
    const bomb = zlibSync(new Uint8Array(MAX_SHARE_DECOMPRESSED_BYTES + 1));
    expect(() => decodeShareHash(`#v1:${base64Url(bomb)}`)).toThrow(
      expect.objectContaining({ code: 'decompressed_too_large' }),
    );
  });

  it('refuses oversized URL and compressed representations', () => {
    expect(() => decodeShareHash(`#v1:${'A'.repeat(MAX_SHARE_HASH_LENGTH)}`)).toThrow(
      expect.objectContaining({ code: 'url_too_large' }),
    );

    let state = 0x5eed1234;
    const source = Array.from({ length: 50_000 }, () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return String.fromCharCode(33 + (state % 90));
    }).join('');
    expect(() => encodeShareHash({ ...envelope, source })).toThrow(
      expect.objectContaining({ code: 'compressed_too_large' }),
    );
  });

  it('rejects source beyond Mermaid safe limits before compression', () => {
    expect(() => encodeShareHash({ ...envelope, source: 'x'.repeat(50_001) })).toThrow(
      expect.objectContaining({ code: 'source_too_large' }),
    );
  });
});
