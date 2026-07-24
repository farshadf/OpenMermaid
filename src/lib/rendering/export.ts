import {
  MAX_PNG_DIMENSION,
  MAX_PNG_PIXELS,
  PNG_BACKGROUNDS,
  type PngBackground,
  type PngScale,
} from './constants';
import { isSanitizedSvg, type SanitizedSvg } from './sanitize';

export interface SvgDimensions {
  width: number;
  height: number;
}

export interface PngExportOptions {
  scale: PngScale;
  background: PngBackground;
}

export class ExportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportLimitError';
  }
}

function parsePositiveNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)(?:px)?\s*$/iu.exec(value);
  if (!match?.[1]) {
    return undefined;
  }
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function measureSvg(svg: SanitizedSvg): SvgDimensions {
  if (!isSanitizedSvg(svg)) {
    throw new TypeError('Only sanitized SVG can be measured.');
  }

  const documentNode = new DOMParser().parseFromString(svg.markup, 'image/svg+xml');
  const root = documentNode.documentElement;
  const viewBox = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (
    viewBox?.length === 4 &&
    viewBox.every(Number.isFinite) &&
    viewBox[2] !== undefined &&
    viewBox[3] !== undefined &&
    viewBox[2] > 0 &&
    viewBox[3] > 0
  ) {
    return { width: viewBox[2], height: viewBox[3] };
  }

  const width = parsePositiveNumber(root.getAttribute('width'));
  const height = parsePositiveNumber(root.getAttribute('height'));
  if (width === undefined || height === undefined) {
    throw new ExportLimitError('The SVG does not declare usable dimensions.');
  }
  return { width, height };
}

export function normalizeExportFilename(requestedName: string, extension: 'png' | 'svg'): string {
  const withoutExtension = requestedName
    .replace(/\.(?:png|svg)$/iu, '')
    .normalize('NFKC')
    .split('')
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127 ? '-' : character;
    })
    .join('')
    .replace(/[/\\:*?"<>|]+/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/gu, '')
    .slice(0, 120);
  const basename = withoutExtension || 'diagram';
  return `${basename}.${extension}`;
}

export function createSvgBlob(svg: SanitizedSvg): Blob {
  if (!isSanitizedSvg(svg)) {
    throw new TypeError('Only sanitized SVG can be exported.');
  }
  return new Blob([svg.markup], { type: 'image/svg+xml;charset=utf-8' });
}

function triggerDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export function downloadSanitizedSvg(svg: SanitizedSvg, filename: string): void {
  triggerDownload(createSvgBlob(svg), normalizeExportFilename(filename, 'svg'));
}

export async function copySanitizedSvg(svg: SanitizedSvg): Promise<void> {
  if (!isSanitizedSvg(svg)) {
    throw new TypeError('Only sanitized SVG can be copied.');
  }
  const clipboard = Reflect.get(navigator, 'clipboard') as Clipboard | undefined;
  if (!clipboard) {
    throw new Error('Clipboard access is unavailable in this browser.');
  }
  await clipboard.writeText(svg.markup);
}

function loadSvgImage(svg: SanitizedSvg): Promise<{ image: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(createSvgBlob(svg));
  const image = new Image();
  image.decoding = 'sync';

  return new Promise((resolve, reject) => {
    image.addEventListener(
      'load',
      () => {
        resolve({ image, url });
      },
      { once: true },
    );
    image.addEventListener(
      'error',
      () => {
        URL.revokeObjectURL(url);
        reject(new Error('The sanitized SVG could not be decoded for PNG export.'));
      },
      { once: true },
    );
    image.src = url;
  });
}

export async function createPngBlob(svg: SanitizedSvg, options: PngExportOptions): Promise<Blob> {
  if (![1, 2, 3].includes(options.scale) || !(options.background in PNG_BACKGROUNDS)) {
    throw new TypeError('PNG scale or background is not supported.');
  }
  const dimensions = measureSvg(svg);
  const width = Math.ceil(dimensions.width * options.scale);
  const height = Math.ceil(dimensions.height * options.scale);

  if (
    width <= 0 ||
    height <= 0 ||
    width > MAX_PNG_DIMENSION ||
    height > MAX_PNG_DIMENSION ||
    width * height > MAX_PNG_PIXELS
  ) {
    throw new ExportLimitError(
      `PNG output would exceed the ${String(MAX_PNG_DIMENSION)}px or ${MAX_PNG_PIXELS.toLocaleString()}-pixel limit.`,
    );
  }

  const { image, url } = await loadSvgImage(svg);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas rendering is unavailable in this browser.');
    }

    const background = PNG_BACKGROUNDS[options.background];
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    } else {
      context.clearRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('The browser could not encode the PNG.'));
        }
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPng(
  svg: SanitizedSvg,
  filename: string,
  options: PngExportOptions,
): Promise<void> {
  const blob = await createPngBlob(svg, options);
  triggerDownload(blob, normalizeExportFilename(filename, 'png'));
}
