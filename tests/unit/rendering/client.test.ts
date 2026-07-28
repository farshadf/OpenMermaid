import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RendererFrameClient,
  RendererOperationError,
  RendererResetError,
  RendererTimeoutError,
} from '../../../src/lib/rendering/client';
import {
  RENDERER_PROTOCOL_CHANNEL,
  RENDERER_PROTOCOL_VERSION,
} from '../../../src/lib/rendering/constants';
import type { RendererRequestMessage } from '../../../src/lib/rendering/protocol';

function createFrame(sandbox = 'allow-scripts'): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', sandbox);
  document.body.append(iframe);
  return iframe;
}

function dispatchFromFrame(iframe: HTMLIFrameElement, data: unknown, origin = 'null'): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin,
      source: iframe.contentWindow,
    }),
  );
}

function responseEnvelope(client: RendererFrameClient) {
  return {
    channel: RENDERER_PROTOCOL_CHANNEL,
    protocolVersion: RENDERER_PROTOCOL_VERSION,
    direction: 'renderer-to-host' as const,
    sessionId: client.sessionId,
  };
}

function announceReady(iframe: HTMLIFrameElement, client: RendererFrameClient): void {
  dispatchFromFrame(iframe, {
    ...responseEnvelope(client),
    kind: 'ready',
  });
}

function captureRequests(iframe: HTMLIFrameElement) {
  const postMessage = vi.fn();
  Object.defineProperty(iframe.contentWindow, 'postMessage', {
    configurable: true,
    value: postMessage,
  });
  return postMessage;
}

async function latestRequest(
  postMessage: ReturnType<typeof vi.fn>,
): Promise<RendererRequestMessage> {
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalled());
  const calls = postMessage.mock.calls as unknown[][];
  return calls.at(-1)?.[0] as RendererRequestMessage;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('RendererFrameClient trust boundary', () => {
  it('requires an opaque-origin allow-scripts-only sandbox', () => {
    const iframe = createFrame('allow-scripts allow-same-origin');

    expect(() => new RendererFrameClient({ iframe })).toThrow(/exactly "allow-scripts"/iu);
  });

  it('re-sanitizes results and retains the last valid result after a render error', async () => {
    const iframe = createFrame();
    const client = new RendererFrameClient({ iframe });
    const postMessage = captureRequests(iframe);
    announceReady(iframe, client);

    const first = client.render({ source: 'flowchart LR\nA-->B', revision: 1 });
    const firstRequest = await latestRequest(postMessage);
    dispatchFromFrame(iframe, {
      ...responseEnvelope(client),
      kind: 'result',
      requestId: firstRequest.requestId,
      revision: 1,
      operation: 'render',
      payload: {
        diagramType: 'flowchart-v2',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><text>Safe</text></svg>',
      },
    });

    const validResult = await first;
    expect(validResult.svg.markup).toContain('<text>Safe</text>');
    expect(validResult.svg.markup).not.toMatch(/script|onload/iu);

    postMessage.mockClear();
    const invalid = client.render({ source: 'not valid', revision: 2 });
    const invalidRequest = await latestRequest(postMessage);
    dispatchFromFrame(iframe, {
      ...responseEnvelope(client),
      kind: 'error',
      requestId: invalidRequest.requestId,
      revision: 2,
      operation: 'render',
      payload: { code: 'invalid-source', message: 'Parse error' },
    });

    await expect(invalid).rejects.toMatchObject({
      code: 'invalid-source',
      revision: 2,
    });
    expect(client.lastValidResult).toBe(validResult);
    client.dispose();
  });

  it('suppresses an older revision before it can overwrite a newer request', async () => {
    const iframe = createFrame();
    const client = new RendererFrameClient({ iframe });
    announceReady(iframe, client);

    const older = client.render({ source: 'flowchart LR\nA-->B', revision: 4 });
    const newer = client.render({ source: 'flowchart LR\nA-->C', revision: 5 });

    await expect(older).rejects.toEqual(expect.any(RendererOperationError));
    await expect(older).rejects.toMatchObject({ code: 'stale', revision: 4 });
    // Avoid leaving the newer request pending when the test tears down.
    client.dispose();
    await expect(newer).rejects.toThrow(/disposed/iu);
  });

  it('rechecks staleness after the lazy sanitizer boundary', async () => {
    const iframe = createFrame();
    const client = new RendererFrameClient({ iframe });
    const postMessage = captureRequests(iframe);
    announceReady(iframe, client);

    const older = client.render({ source: 'flowchart LR\nA-->B', revision: 6 });
    const olderRequest = await latestRequest(postMessage);
    dispatchFromFrame(iframe, {
      ...responseEnvelope(client),
      kind: 'result',
      requestId: olderRequest.requestId,
      revision: 6,
      operation: 'render',
      payload: {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Old</text></svg>',
      },
    });

    // Let the response cross the request boundary and reach the lazy sanitizer
    // import without allowing that import's continuation to publish the result.
    await Promise.resolve();
    await Promise.resolve();
    const newer = client.render({ source: 'flowchart LR\nA-->C', revision: 7 });

    await expect(older).rejects.toMatchObject({ code: 'stale', revision: 6 });
    expect(client.lastValidResult).toBeUndefined();
    client.dispose();
    await expect(newer).rejects.toThrow(/disposed/iu);
  });

  it('rejects an old-realm result when reset crosses the lazy sanitizer boundary', async () => {
    const iframe = createFrame();
    const client = new RendererFrameClient({ iframe });
    const postMessage = captureRequests(iframe);
    announceReady(iframe, client);

    const render = client.render({ source: 'flowchart LR\nA-->B', revision: 8 });
    const request = await latestRequest(postMessage);
    dispatchFromFrame(iframe, {
      ...responseEnvelope(client),
      kind: 'result',
      requestId: request.requestId,
      revision: 8,
      operation: 'render',
      payload: {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Old realm</text></svg>',
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    client.reset('test-reset-during-sanitization');

    await expect(render).rejects.toEqual(expect.any(RendererResetError));
    expect(client.lastValidResult).toBeUndefined();
    client.dispose();
  });

  it('rejects an in-flight result when disposal crosses the lazy sanitizer boundary', async () => {
    const iframe = createFrame();
    const client = new RendererFrameClient({ iframe });
    const postMessage = captureRequests(iframe);
    announceReady(iframe, client);

    const render = client.render({ source: 'flowchart LR\nA-->B', revision: 9 });
    const request = await latestRequest(postMessage);
    dispatchFromFrame(iframe, {
      ...responseEnvelope(client),
      kind: 'result',
      requestId: request.requestId,
      revision: 9,
      operation: 'render',
      payload: {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Disposed</text></svg>',
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    client.dispose();

    await expect(render).rejects.toEqual(expect.any(RendererResetError));
    expect(client.lastValidResult).toBeUndefined();
  });

  it('ignores wrong-origin and wrong-session messages', async () => {
    const iframe = createFrame();
    const client = new RendererFrameClient({ iframe });
    const postMessage = captureRequests(iframe);
    announceReady(iframe, client);

    const render = client.render({ source: 'flowchart LR\nA-->B', revision: 1 });
    const request = await latestRequest(postMessage);
    const result = {
      ...responseEnvelope(client),
      kind: 'result',
      requestId: request.requestId,
      revision: 1,
      operation: 'render',
      payload: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" />' },
    };
    dispatchFromFrame(iframe, result, 'https://attacker.invalid');
    dispatchFromFrame(iframe, { ...result, sessionId: 'wrong_session_12345678' });

    let settled = false;
    void render.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    dispatchFromFrame(iframe, result);
    await expect(render).resolves.toMatchObject({ revision: 1 });
    client.dispose();
  });

  it('reloads the isolated realm after a bounded operation timeout', async () => {
    vi.useFakeTimers();
    const iframe = createFrame();
    const onReset = vi.fn();
    const client = new RendererFrameClient({ iframe, timeoutMs: 1_000, onReset });
    captureRequests(iframe);
    const originalSession = client.sessionId;
    announceReady(iframe, client);

    const render = client.render({ source: 'flowchart LR\nA-->B', revision: 1 });
    const rejection = expect(render).rejects.toEqual(expect.any(RendererTimeoutError));
    await vi.advanceTimersByTimeAsync(1_001);

    await rejection;
    expect(onReset).toHaveBeenCalledWith('operation-timeout');
    expect(client.sessionId).not.toBe(originalSession);
    client.dispose();
  });

  it('rehydrates the last valid preview after an isolated-realm reset', async () => {
    const iframe = createFrame();
    const client = new RendererFrameClient({ iframe });
    let postMessage = captureRequests(iframe);
    announceReady(iframe, client);

    const render = client.render({ source: 'flowchart LR\nA-->B', revision: 3 });
    const request = await latestRequest(postMessage);
    dispatchFromFrame(iframe, {
      ...responseEnvelope(client),
      kind: 'result',
      requestId: request.requestId,
      revision: 3,
      operation: 'render',
      payload: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" />' },
    });
    await render;

    client.reset('test-reset');
    postMessage = captureRequests(iframe);
    announceReady(iframe, client);
    const restoredRequest = await latestRequest(postMessage);

    expect(restoredRequest).toMatchObject({
      operation: 'render',
      revision: 3,
      payload: { source: 'flowchart LR\nA-->B' },
    });
    dispatchFromFrame(iframe, {
      ...responseEnvelope(client),
      kind: 'result',
      requestId: restoredRequest.requestId,
      revision: 3,
      operation: 'render',
      payload: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" />' },
    });
    client.dispose();
  });
});
