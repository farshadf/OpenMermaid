import { Unzlib, zlibSync } from 'fflate';

import { DocumentValidationError, validateShareEnvelope, type ShareEnvelopeV1 } from '../documents';
import {
  MAX_SHARE_COMPRESSED_BYTES,
  MAX_SHARE_DECOMPRESSED_BYTES,
  MAX_SHARE_HASH_LENGTH,
  SHARE_FRAGMENT_PREFIX,
} from './constants';
import { ShareCodecError } from './errors';

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToBase64Url(bytes: Uint8Array): string {
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += BASE64URL_ALPHABET.charAt(first >> 2);
    encoded += BASE64URL_ALPHABET.charAt(((first & 3) << 4) | ((second ?? 0) >> 4));
    if (second !== undefined) {
      encoded += BASE64URL_ALPHABET.charAt(((second & 15) << 2) | ((third ?? 0) >> 6));
    }
    if (third !== undefined) encoded += BASE64URL_ALPHABET.charAt(third & 63);
  }
  return encoded;
}

function base64UrlToBytes(encoded: string): Uint8Array {
  if (encoded.length === 0 || encoded.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/u.test(encoded)) {
    throw new ShareCodecError('malformed_fragment', 'The share link payload is malformed.');
  }

  const outputLength = Math.floor((encoded.length * 6) / 8);
  const output = new Uint8Array(outputLength);
  let accumulator = 0;
  let bits = 0;
  let outputIndex = 0;
  for (const character of encoded) {
    const value = BASE64URL_ALPHABET.indexOf(character);
    if (value < 0) {
      throw new ShareCodecError('malformed_fragment', 'The share link payload is malformed.');
    }
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[outputIndex] = (accumulator >> bits) & 255;
      outputIndex += 1;
    }
  }
  if (bytesToBase64Url(output) !== encoded) {
    throw new ShareCodecError('malformed_fragment', 'The share link payload is malformed.');
  }
  return output;
}

function boundedUnzlib(compressed: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  try {
    const decompressor = new Unzlib((chunk): void => {
      totalLength += chunk.length;
      if (totalLength > MAX_SHARE_DECOMPRESSED_BYTES) {
        throw new ShareCodecError(
          'decompressed_too_large',
          'The shared diagram expands beyond the safe size limit.',
        );
      }
      chunks.push(chunk.slice());
    });
    decompressor.push(compressed, true);
  } catch (error) {
    if (error instanceof ShareCodecError) throw error;
    throw new ShareCodecError(
      'malformed_fragment',
      'The share link cannot be decompressed.',
      error,
    );
  }

  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function extractHash(input: string): string {
  if (input.startsWith('#')) return input;
  try {
    const hash = new URL(input).hash;
    if (hash.length > 0) return hash;
  } catch {
    // The common location.hash path is handled above. Other input is invalid.
  }
  throw new ShareCodecError('missing_fragment', 'No Open Mermaid share fragment was found.');
}

function wrapEnvelopeError(error: unknown): never {
  if (error instanceof DocumentValidationError && error.issue === 'source_too_large') {
    throw new ShareCodecError('source_too_large', error.message, error);
  }
  if (error instanceof DocumentValidationError && error.issue === 'unsupported_version') {
    throw new ShareCodecError('unsupported_version', error.message, error);
  }
  throw new ShareCodecError('malformed_fragment', 'The shared diagram data is invalid.', error);
}

export function encodeShareHash(value: ShareEnvelopeV1): string {
  let envelope: ShareEnvelopeV1;
  try {
    envelope = validateShareEnvelope(value);
  } catch (error) {
    wrapEnvelopeError(error);
  }

  const serialized = new TextEncoder().encode(JSON.stringify(envelope));
  if (serialized.length > MAX_SHARE_DECOMPRESSED_BYTES) {
    throw new ShareCodecError(
      'decompressed_too_large',
      'The diagram is too large for a URL share. Export a .mmd file instead.',
    );
  }

  const compressed = zlibSync(serialized, { level: 9 });
  if (compressed.length > MAX_SHARE_COMPRESSED_BYTES) {
    throw new ShareCodecError(
      'compressed_too_large',
      'The diagram is too large for a URL share. Export a .mmd file instead.',
    );
  }

  const hash = `${SHARE_FRAGMENT_PREFIX}${bytesToBase64Url(compressed)}`;
  if (hash.length > MAX_SHARE_HASH_LENGTH) {
    throw new ShareCodecError(
      'url_too_large',
      'The diagram is too large for a reliable URL share. Export a .mmd file instead.',
    );
  }
  return hash;
}

export function decodeShareHash(input: string): ShareEnvelopeV1 {
  const hash = extractHash(input);
  if (hash.length > MAX_SHARE_HASH_LENGTH) {
    throw new ShareCodecError('url_too_large', 'The share link exceeds the safe URL size limit.');
  }
  if (!hash.startsWith(SHARE_FRAGMENT_PREFIX)) {
    if (/^#v\d+:/u.test(hash)) {
      throw new ShareCodecError(
        'unsupported_version',
        'This share link was created with an unsupported version.',
      );
    }
    throw new ShareCodecError('malformed_fragment', 'This is not an Open Mermaid share link.');
  }

  const compressed = base64UrlToBytes(hash.slice(SHARE_FRAGMENT_PREFIX.length));
  if (compressed.length > MAX_SHARE_COMPRESSED_BYTES) {
    throw new ShareCodecError(
      'compressed_too_large',
      'The compressed share payload exceeds the safe size limit.',
    );
  }

  const decompressed = boundedUnzlib(compressed);
  let parsed: unknown;
  try {
    const serialized = new TextDecoder('utf-8', { fatal: true }).decode(decompressed);
    parsed = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new ShareCodecError('malformed_fragment', 'The shared diagram is not valid data.', error);
  }

  try {
    return validateShareEnvelope(parsed);
  } catch (error) {
    wrapEnvelopeError(error);
  }
}
