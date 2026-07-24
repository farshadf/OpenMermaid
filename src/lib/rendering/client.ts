import {
  DEFAULT_RENDER_TIMEOUT_MS,
  MAX_MERMAID_SOURCE_LENGTH,
  MAX_RENDER_TIMEOUT_MS,
  MIN_RENDER_TIMEOUT_MS,
  type MermaidTheme,
} from './constants';
import {
  createRendererRequest,
  parseRendererResponse,
  type RendererErrorCode,
  type RendererOperation,
  type RendererResponseMessage,
  type RendererViewportRequestPayload,
} from './protocol';
import { sanitizeSvg, type SanitizedSvg } from './sanitize';
import type { ViewportState } from './viewport';

export interface RendererRenderResult {
  revision: number;
  diagramType?: string;
  svg: SanitizedSvg;
}

export interface RendererParseResult {
  revision: number;
  diagramType?: string;
}

export interface RendererFrameClientOptions {
  iframe: HTMLIFrameElement;
  rendererUrl?: string;
  timeoutMs?: number;
  onReset?: (reason: string) => void;
}

interface PendingRequest {
  operation: RendererOperation;
  revision: number;
  resolve: (message: RendererResponseMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class RendererTimeoutError extends Error {
  constructor(message = 'The isolated renderer did not respond in time.') {
    super(message);
    this.name = 'RendererTimeoutError';
  }
}

export class RendererResetError extends Error {
  constructor(message = 'The isolated renderer was reset.') {
    super(message);
    this.name = 'RendererResetError';
  }
}

export class RendererOperationError extends Error {
  readonly code: RendererErrorCode;
  readonly revision: number;

  constructor(code: RendererErrorCode, revision: number, message: string) {
    super(message);
    this.name = 'RendererOperationError';
    this.code = code;
    this.revision = revision;
  }
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  // A reset can reject before a consumer calls a method. Avoid an unhandled rejection.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

function createOpaqueId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertSecureSandbox(iframe: HTMLIFrameElement): void {
  const sandbox = iframe.getAttribute('sandbox')?.trim().split(/\s+/u).filter(Boolean);
  if (sandbox?.length !== 1 || sandbox[0] !== 'allow-scripts') {
    throw new TypeError('The renderer iframe sandbox must be exactly "allow-scripts".');
  }
}

function createRendererUrl(rendererUrl: string, sessionId: string): string {
  const url = new URL(rendererUrl, location.href);
  url.hash = `v=1&session=${encodeURIComponent(sessionId)}`;
  return url.href;
}

export class RendererFrameClient {
  private readonly iframe: HTMLIFrameElement;
  private readonly rendererUrl: string;
  private readonly timeoutMs: number;
  private readonly onReset: ((reason: string) => void) | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private sessionIdValue = '';
  private ready = createDeferred();
  private disposed = false;
  private latestRenderRevision = -1;
  private lastValidResultValue: RendererRenderResult | undefined;
  private lastValidInput:
    | {
        source: string;
        theme: MermaidTheme;
        revision: number;
      }
    | undefined;

  constructor(options: RendererFrameClientOptions) {
    assertSecureSandbox(options.iframe);
    this.iframe = options.iframe;
    this.rendererUrl = options.rendererUrl ?? '/renderer/';
    this.timeoutMs = Math.min(
      MAX_RENDER_TIMEOUT_MS,
      Math.max(MIN_RENDER_TIMEOUT_MS, options.timeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS),
    );
    this.onReset = options.onReset;
    window.addEventListener('message', this.handleMessage);
    this.loadFreshFrame();
  }

  get sessionId(): string {
    return this.sessionIdValue;
  }

  get lastValidResult(): RendererRenderResult | undefined {
    return this.lastValidResultValue;
  }

  async render(input: {
    source: string;
    theme?: MermaidTheme;
    revision: number;
  }): Promise<RendererRenderResult> {
    if (input.source.length > MAX_MERMAID_SOURCE_LENGTH) {
      throw new RendererOperationError(
        'source-too-large',
        input.revision,
        `Mermaid source is limited to ${MAX_MERMAID_SOURCE_LENGTH.toLocaleString()} characters.`,
      );
    }
    this.latestRenderRevision = Math.max(this.latestRenderRevision, input.revision);
    const response = await this.request({
      operation: 'render',
      source: input.source,
      revision: input.revision,
      ...(input.theme !== undefined ? { theme: input.theme } : {}),
    });
    if (response.kind !== 'result' || response.operation !== 'render' || !response.payload.svg) {
      throw new Error('The renderer returned an unexpected render response.');
    }
    if (response.revision < this.latestRenderRevision) {
      throw new RendererOperationError('stale', response.revision, 'A newer preview is available.');
    }

    // Re-sanitize at the trust boundary before exposing data to copy/download helpers.
    const result: RendererRenderResult = {
      revision: response.revision,
      ...(response.payload.diagramType ? { diagramType: response.payload.diagramType } : {}),
      svg: sanitizeSvg(response.payload.svg),
    };
    this.lastValidResultValue = result;
    this.lastValidInput = {
      source: input.source,
      theme: input.theme ?? 'default',
      revision: input.revision,
    };
    return result;
  }

  async parse(input: {
    source: string;
    theme?: MermaidTheme;
    revision: number;
  }): Promise<RendererParseResult> {
    if (input.source.length > MAX_MERMAID_SOURCE_LENGTH) {
      throw new RendererOperationError(
        'source-too-large',
        input.revision,
        `Mermaid source is limited to ${MAX_MERMAID_SOURCE_LENGTH.toLocaleString()} characters.`,
      );
    }
    const response = await this.request({
      operation: 'parse',
      source: input.source,
      revision: input.revision,
      ...(input.theme !== undefined ? { theme: input.theme } : {}),
    });
    if (response.kind !== 'result' || response.operation !== 'parse') {
      throw new Error('The renderer returned an unexpected parse response.');
    }
    return {
      revision: response.revision,
      ...(response.payload.diagramType ? { diagramType: response.payload.diagramType } : {}),
    };
  }

  zoomBy(factor: number): Promise<ViewportState> {
    return this.viewport({ action: 'zoom-by', factor });
  }

  panBy(x: number, y: number): Promise<ViewportState> {
    return this.viewport({ action: 'pan-by', x, y });
  }

  fit(): Promise<ViewportState> {
    return this.viewport({ action: 'fit' });
  }

  resetViewport(): Promise<ViewportState> {
    return this.viewport({ action: 'reset' });
  }

  async requestFullscreen(): Promise<void> {
    await this.iframe.requestFullscreen();
  }

  reset(reason = 'manual'): void {
    const lastValidInput = this.lastValidInput;
    this.rejectInFlight(new RendererResetError());
    this.ready.reject(new RendererResetError());
    this.onReset?.(reason);
    this.loadFreshFrame();
    if (lastValidInput) {
      void this.rehydrateLastValidPreview(lastValidInput);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    window.removeEventListener('message', this.handleMessage);
    this.rejectInFlight(new RendererResetError('The renderer client was disposed.'));
    this.ready.reject(new RendererResetError('The renderer client was disposed.'));
  }

  private async viewport(payload: RendererViewportRequestPayload): Promise<ViewportState> {
    const response = await this.request({
      operation: 'viewport',
      viewport: payload,
      revision: Math.max(0, this.latestRenderRevision),
    });
    if (
      response.kind !== 'result' ||
      response.operation !== 'viewport' ||
      !response.payload.viewport
    ) {
      throw new Error('The renderer returned an unexpected viewport response.');
    }
    return response.payload.viewport;
  }

  private loadFreshFrame(): void {
    this.sessionIdValue = createOpaqueId();
    this.ready = createDeferred();
    this.iframe.referrerPolicy = 'no-referrer';
    this.iframe.src = createRendererUrl(this.rendererUrl, this.sessionIdValue);
  }

  private async request(input: {
    operation: RendererOperation;
    revision: number;
    source?: string;
    theme?: MermaidTheme;
    viewport?: RendererViewportRequestPayload;
    resetOnTimeout?: boolean;
  }): Promise<RendererResponseMessage> {
    if (this.disposed) {
      throw new RendererResetError('The renderer client was disposed.');
    }
    const startedAt = performance.now();
    const resetOnTimeout = input.resetOnTimeout ?? true;
    await this.waitUntilReady(startedAt, resetOnTimeout);

    if (input.operation === 'render' && input.revision < this.latestRenderRevision) {
      throw new RendererOperationError('stale', input.revision, 'A newer preview was requested.');
    }

    const requestId = createOpaqueId();
    const request = createRendererRequest({
      sessionId: this.sessionIdValue,
      requestId,
      revision: input.revision,
      operation: input.operation,
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.theme !== undefined ? { theme: input.theme } : {}),
      ...(input.viewport !== undefined ? { viewport: input.viewport } : {}),
    });
    const remainingMs = Math.max(1, this.timeoutMs - (performance.now() - startedAt));

    return await new Promise<RendererResponseMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RendererTimeoutError());
        if (resetOnTimeout) {
          this.reset('operation-timeout');
        }
      }, remainingMs);
      this.pending.set(requestId, {
        operation: input.operation,
        revision: input.revision,
        resolve,
        reject,
        timer,
      });

      const frameWindow = this.iframe.contentWindow;
      if (!frameWindow) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new RendererResetError('The renderer frame is unavailable.'));
        return;
      }
      // A sandbox without allow-same-origin has an opaque origin, so an exact target is impossible.
      // Source, origin, session, schema, request ID, operation, and revision are all validated on reply.
      frameWindow.postMessage(request, '*');
    });
  }

  private async waitUntilReady(startedAt: number, resetOnTimeout: boolean): Promise<void> {
    const remainingMs = Math.max(1, this.timeoutMs - (performance.now() - startedAt));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.ready.promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new RendererTimeoutError()), remainingMs);
        }),
      ]);
    } catch (error) {
      if (error instanceof RendererTimeoutError && resetOnTimeout) {
        this.reset('startup-timeout');
      }
      throw error;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private rejectInFlight(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }

  private async rehydrateLastValidPreview(input: {
    source: string;
    theme: MermaidTheme;
    revision: number;
  }): Promise<void> {
    try {
      await this.request({
        operation: 'render',
        source: input.source,
        theme: input.theme,
        revision: Math.max(input.revision, this.latestRenderRevision),
        resetOnTimeout: false,
      });
    } catch {
      // Best-effort recovery: the next explicit edit can start another isolated realm.
    }
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (this.disposed || event.source !== this.iframe.contentWindow || event.origin !== 'null') {
      return;
    }
    const response = parseRendererResponse(event.data, this.sessionIdValue);
    if (!response) {
      return;
    }
    if (response.kind === 'ready') {
      this.ready.resolve();
      return;
    }

    const pending = this.pending.get(response.requestId);
    if (pending?.operation !== response.operation || pending.revision !== response.revision) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(response.requestId);

    if (response.kind === 'error') {
      pending.reject(
        new RendererOperationError(
          response.payload.code,
          response.revision,
          response.payload.message,
        ),
      );
    } else {
      pending.resolve(response);
    }
  };
}
