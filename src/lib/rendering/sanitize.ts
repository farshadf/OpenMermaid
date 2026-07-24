import DOMPurify from 'dompurify';

import { MAX_SVG_BYTES } from './constants';

const SANITIZED_SVG_BRAND: unique symbol = Symbol('OpenMermaidSanitizedSvg');

export interface SanitizedSvg {
  readonly markup: string;
  readonly byteLength: number;
  readonly [SANITIZED_SVG_BRAND]: true;
}

export class UnsafeSvgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeSvgError';
  }
}

const BLOCKED_ELEMENTS = new Set([
  'animate',
  'animatemotion',
  'animatetransform',
  'audio',
  'discard',
  'embed',
  'feimage',
  'foreignobject',
  'iframe',
  'image',
  'meta',
  'object',
  'script',
  'set',
  'video',
]);

const DIRECT_URL_ATTRIBUTES = new Set([
  'action',
  'formaction',
  'href',
  'poster',
  'src',
  'xlink:href',
]);

const CSS_URL_ATTRIBUTES = new Set([
  'clip-path',
  'cursor',
  'fill',
  'filter',
  'marker',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'stroke',
]);

const UNSAFE_CSS_PATTERN =
  /(?:@import|@font-face|behavior\s*:|-moz-binding|expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|(?:-webkit-)?image-set\s*\(|cross-fade\s*\(|paint\s*\()/iu;
const CSS_URL_PATTERN = /url\(\s*(['"]?)(.*?)\1\s*\)/giu;
const CSS_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//gu;
const CSS_ESCAPE_PATTERN = /\\([0-9A-Fa-f]{1,6}\s?|.)/gu;
const SAFE_FRAGMENT_PATTERN = /^#[A-Za-z_][\w:.-]*$/u;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isSafeFragment(value: string): boolean {
  return SAFE_FRAGMENT_PATTERN.test(value.trim());
}

function normalizeCssForInspection(css: string): string {
  return css
    .replace(CSS_COMMENT_PATTERN, '')
    .replace(CSS_ESCAPE_PATTERN, (_match, escaped: string) => {
      const hex = escaped.trim();
      if (/^[0-9A-Fa-f]{1,6}$/u.test(hex)) {
        const codePoint = Number.parseInt(hex, 16);
        return codePoint === 0 || codePoint > 0x10ffff ? '\uFFFD' : String.fromCodePoint(codePoint);
      }
      return escaped;
    });
}

function sanitizeCss(css: string): string {
  const normalizedCss = normalizeCssForInspection(css);
  if (UNSAFE_CSS_PATTERN.test(normalizedCss)) {
    return '';
  }

  return normalizedCss.replace(CSS_URL_PATTERN, (_match, _quote: string, rawUrl: string) => {
    const url = rawUrl.trim();
    return isSafeFragment(url) ? `url(${url})` : 'none';
  });
}

function removeElementPreservingText(element: Element): void {
  if (element.localName.toLowerCase() === 'foreignobject') {
    const text = element.textContent.trim();
    if (text) {
      element.replaceWith(element.ownerDocument.createTextNode(text));
      return;
    }
  }
  element.remove();
}

function scrubElement(element: Element): void {
  const localName = element.localName.toLowerCase();
  if (BLOCKED_ELEMENTS.has(localName)) {
    removeElementPreservingText(element);
    return;
  }

  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    const localAttributeName = attribute.localName.toLowerCase();
    const value = attribute.value.trim();

    if (name.startsWith('on') || localAttributeName.startsWith('on')) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (DIRECT_URL_ATTRIBUTES.has(name) && !isSafeFragment(value)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (name === 'style') {
      const safeStyle = sanitizeCss(value);
      if (safeStyle) {
        element.setAttribute(attribute.name, safeStyle);
      } else {
        element.removeAttribute(attribute.name);
      }
      continue;
    }

    if (CSS_URL_ATTRIBUTES.has(name) || /url\s*\(/iu.test(value)) {
      const safeValue = sanitizeCss(value);
      if (safeValue) {
        element.setAttribute(attribute.name, safeValue);
      } else {
        element.removeAttribute(attribute.name);
      }
    }
  }

  if (localName === 'style') {
    const safeCss = sanitizeCss(element.textContent);
    if (safeCss) {
      element.textContent = safeCss;
    } else {
      element.remove();
    }
  }
}

function scrubSvgDocument(documentNode: Document): SVGSVGElement {
  const parserError = documentNode.querySelector('parsererror');
  if (parserError || documentNode.documentElement.localName.toLowerCase() !== 'svg') {
    throw new UnsafeSvgError('The renderer returned invalid SVG.');
  }

  const root = documentNode.documentElement as unknown as SVGSVGElement;
  for (const element of [...root.querySelectorAll('*')]) {
    scrubElement(element);
  }
  scrubElement(root);

  if (!root.isConnected || root.localName.toLowerCase() !== 'svg') {
    throw new UnsafeSvgError('The SVG root was rejected by the sanitizer.');
  }

  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.removeAttribute('xmlns:xlink');
  return root;
}

/**
 * Applies DOMPurify's SVG profile and then a strict resource/CSS pass.
 * The branded result is the only SVG accepted by export helpers.
 */
export function sanitizeSvg(unsafeMarkup: string): SanitizedSvg {
  if (typeof unsafeMarkup !== 'string' || unsafeMarkup.length === 0) {
    throw new UnsafeSvgError('Expected a non-empty SVG string.');
  }
  if (byteLength(unsafeMarkup) > MAX_SVG_BYTES) {
    throw new UnsafeSvgError('The rendered SVG exceeds the export limit.');
  }

  const purified = DOMPurify.sanitize(unsafeMarkup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    FORBID_TAGS: [...BLOCKED_ELEMENTS],
    FORBID_ATTR: ['srcset'],
  });

  const documentNode = new DOMParser().parseFromString(purified, 'image/svg+xml');
  const root = scrubSvgDocument(documentNode);
  const markup = new XMLSerializer().serializeToString(root);
  const sanitizedByteLength = byteLength(markup);
  if (sanitizedByteLength > MAX_SVG_BYTES) {
    throw new UnsafeSvgError('The sanitized SVG exceeds the export limit.');
  }

  return Object.freeze({
    markup,
    byteLength: sanitizedByteLength,
    [SANITIZED_SVG_BRAND]: true as const,
  });
}

export function isSanitizedSvg(value: unknown): value is SanitizedSvg {
  return (
    typeof value === 'object' &&
    value !== null &&
    SANITIZED_SVG_BRAND in value &&
    (value as Partial<SanitizedSvg>)[SANITIZED_SVG_BRAND] === true &&
    typeof (value as Partial<SanitizedSvg>).markup === 'string'
  );
}

export function sanitizedSvgToElement(svg: SanitizedSvg): SVGSVGElement {
  if (!isSanitizedSvg(svg)) {
    throw new TypeError('Only sanitized SVG can be converted to an element.');
  }

  const documentNode = new DOMParser().parseFromString(svg.markup, 'image/svg+xml');
  const root = documentNode.documentElement;
  if (root.localName.toLowerCase() !== 'svg') {
    throw new UnsafeSvgError('The sanitized value no longer contains an SVG root.');
  }
  return document.importNode(root, true) as unknown as SVGSVGElement;
}
