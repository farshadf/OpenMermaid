import {
  ALLOWED_MERMAID_THEMES,
  MAX_MERMAID_SOURCE_LENGTH,
  MAX_SVG_BYTES,
  RENDERER_PROTOCOL_CHANNEL,
  RENDERER_PROTOCOL_VERSION,
  type MermaidTheme,
} from './constants';

export type RendererOperation = 'parse' | 'render' | 'viewport';

export interface RendererSourceRequestPayload {
  source: string;
  theme: MermaidTheme;
}

export type RendererViewportAction = 'fit' | 'pan-by' | 'reset' | 'zoom-by';

export interface RendererViewportRequestPayload {
  action: RendererViewportAction;
  factor?: number;
  x?: number;
  y?: number;
}

interface RendererRequestMessageBase {
  channel: typeof RENDERER_PROTOCOL_CHANNEL;
  protocolVersion: typeof RENDERER_PROTOCOL_VERSION;
  direction: 'host-to-renderer';
  kind: 'request';
  sessionId: string;
  requestId: string;
  revision: number;
}

export interface RendererSourceRequestMessage extends RendererRequestMessageBase {
  operation: 'parse' | 'render';
  payload: RendererSourceRequestPayload;
}

export interface RendererViewportRequestMessage extends RendererRequestMessageBase {
  operation: 'viewport';
  payload: RendererViewportRequestPayload;
}

export type RendererRequestMessage = RendererSourceRequestMessage | RendererViewportRequestMessage;

export interface RendererReadyMessage {
  channel: typeof RENDERER_PROTOCOL_CHANNEL;
  protocolVersion: typeof RENDERER_PROTOCOL_VERSION;
  direction: 'renderer-to-host';
  kind: 'ready';
  sessionId: string;
}

export interface RendererResultMessage {
  channel: typeof RENDERER_PROTOCOL_CHANNEL;
  protocolVersion: typeof RENDERER_PROTOCOL_VERSION;
  direction: 'renderer-to-host';
  kind: 'result';
  sessionId: string;
  requestId: string;
  revision: number;
  operation: RendererOperation;
  payload: {
    diagramType?: string;
    svg?: string;
    viewport?: {
      scale: number;
      x: number;
      y: number;
    };
  };
}

export type RendererErrorCode =
  | 'invalid-message'
  | 'invalid-source'
  | 'render-failed'
  | 'source-too-large'
  | 'stale'
  | 'internal';

export interface RendererErrorMessage {
  channel: typeof RENDERER_PROTOCOL_CHANNEL;
  protocolVersion: typeof RENDERER_PROTOCOL_VERSION;
  direction: 'renderer-to-host';
  kind: 'error';
  sessionId: string;
  requestId: string;
  revision: number;
  operation: RendererOperation;
  payload: {
    code: RendererErrorCode;
    message: string;
  };
}

export type RendererResponseMessage =
  RendererReadyMessage | RendererResultMessage | RendererErrorMessage;

type UnknownRecord = Record<string, unknown>;

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/u;

function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function hasProtocolEnvelope(
  value: UnknownRecord,
  direction: RendererRequestMessage['direction'] | RendererResponseMessage['direction'],
): boolean {
  return (
    value.channel === RENDERER_PROTOCOL_CHANNEL &&
    value.protocolVersion === RENDERER_PROTOCOL_VERSION &&
    value.direction === direction
  );
}

export function isRendererSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

export function isRendererRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

export function isRendererRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

export function isMermaidTheme(value: unknown): value is MermaidTheme {
  return typeof value === 'string' && (ALLOWED_MERMAID_THEMES as readonly string[]).includes(value);
}

export function parseRendererRequest(
  value: unknown,
  expectedSessionId?: string,
): RendererRequestMessage | undefined {
  if (!isRecord(value) || !hasProtocolEnvelope(value, 'host-to-renderer')) {
    return undefined;
  }

  if (
    value.kind !== 'request' ||
    !isRendererSessionId(value.sessionId) ||
    (expectedSessionId !== undefined && value.sessionId !== expectedSessionId) ||
    !isRendererRequestId(value.requestId) ||
    !isRendererRevision(value.revision) ||
    (value.operation !== 'parse' &&
      value.operation !== 'render' &&
      value.operation !== 'viewport') ||
    !isRecord(value.payload)
  ) {
    return undefined;
  }

  if (value.operation === 'parse' || value.operation === 'render') {
    if (
      typeof value.payload.source !== 'string' ||
      value.payload.source.length > MAX_MERMAID_SOURCE_LENGTH ||
      !isMermaidTheme(value.payload.theme)
    ) {
      return undefined;
    }
  } else if (!isViewportPayload(value.payload)) {
    return undefined;
  }

  return value as unknown as RendererRequestMessage;
}

export function parseRendererResponse(
  value: unknown,
  expectedSessionId: string,
): RendererResponseMessage | undefined {
  if (
    !isRecord(value) ||
    !hasProtocolEnvelope(value, 'renderer-to-host') ||
    value.sessionId !== expectedSessionId ||
    !isRendererSessionId(value.sessionId)
  ) {
    return undefined;
  }

  if (value.kind === 'ready') {
    return value as unknown as RendererReadyMessage;
  }

  if (
    (value.kind !== 'result' && value.kind !== 'error') ||
    !isRendererRequestId(value.requestId) ||
    !isRendererRevision(value.revision) ||
    (value.operation !== 'parse' &&
      value.operation !== 'render' &&
      value.operation !== 'viewport') ||
    !isRecord(value.payload)
  ) {
    return undefined;
  }

  if (value.kind === 'result') {
    if (
      (value.payload.diagramType !== undefined &&
        (typeof value.payload.diagramType !== 'string' ||
          value.payload.diagramType.length > 100)) ||
      (value.payload.svg !== undefined && typeof value.payload.svg !== 'string') ||
      (typeof value.payload.svg === 'string' && value.payload.svg.length > MAX_SVG_BYTES) ||
      (value.operation === 'render' && typeof value.payload.svg !== 'string') ||
      (value.payload.viewport !== undefined && !isViewportState(value.payload.viewport))
    ) {
      return undefined;
    }

    return value as unknown as RendererResultMessage;
  }

  const errorCodes: readonly RendererErrorCode[] = [
    'invalid-message',
    'invalid-source',
    'render-failed',
    'source-too-large',
    'stale',
    'internal',
  ];
  if (
    typeof value.payload.code !== 'string' ||
    !errorCodes.includes(value.payload.code as RendererErrorCode) ||
    typeof value.payload.message !== 'string' ||
    value.payload.message.length > 600
  ) {
    return undefined;
  }

  return value as unknown as RendererErrorMessage;
}

export function createRendererRequest(input: {
  sessionId: string;
  requestId: string;
  revision: number;
  operation: RendererOperation;
  source?: string;
  theme?: MermaidTheme;
  viewport?: RendererViewportRequestPayload;
}): RendererRequestMessage {
  const common = {
    channel: RENDERER_PROTOCOL_CHANNEL,
    protocolVersion: RENDERER_PROTOCOL_VERSION,
    direction: 'host-to-renderer' as const,
    kind: 'request' as const,
    sessionId: input.sessionId,
    requestId: input.requestId,
    revision: input.revision,
  };
  const message: RendererRequestMessage =
    input.operation === 'viewport'
      ? {
          ...common,
          operation: 'viewport',
          payload: input.viewport ?? { action: 'reset' },
        }
      : {
          ...common,
          operation: input.operation,
          payload: {
            source: input.source ?? '',
            theme: input.theme ?? 'default',
          },
        };

  if (parseRendererRequest(message, input.sessionId) === undefined) {
    throw new TypeError('Cannot create an invalid renderer request.');
  }

  return message;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isViewportPayload(
  value: UnknownRecord,
): value is UnknownRecord & RendererViewportRequestPayload {
  if (
    value.action !== 'fit' &&
    value.action !== 'pan-by' &&
    value.action !== 'reset' &&
    value.action !== 'zoom-by'
  ) {
    return false;
  }
  if (value.action === 'zoom-by') {
    return isFiniteNumber(value.factor) && value.factor > 0 && value.factor <= 4;
  }
  if (value.action === 'pan-by') {
    return (
      isFiniteNumber(value.x) &&
      Math.abs(value.x) <= 100_000 &&
      isFiniteNumber(value.y) &&
      Math.abs(value.y) <= 100_000
    );
  }
  return true;
}

function isViewportState(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.scale) &&
    value.scale >= 0.1 &&
    value.scale <= 8 &&
    isFiniteNumber(value.x) &&
    Math.abs(value.x) <= 1_000_000 &&
    isFiniteNumber(value.y) &&
    Math.abs(value.y) <= 1_000_000
  );
}

export function createRendererResponseBase(sessionId: string) {
  return {
    channel: RENDERER_PROTOCOL_CHANNEL,
    protocolVersion: RENDERER_PROTOCOL_VERSION,
    direction: 'renderer-to-host' as const,
    sessionId,
  };
}
