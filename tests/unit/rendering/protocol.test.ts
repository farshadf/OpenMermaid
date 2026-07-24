import { describe, expect, it } from 'vitest';

import {
  MAX_MERMAID_SOURCE_LENGTH,
  RENDERER_PROTOCOL_CHANNEL,
  RENDERER_PROTOCOL_VERSION,
} from '../../../src/lib/rendering/constants';
import {
  createRendererRequest,
  parseRendererRequest,
  parseRendererResponse,
} from '../../../src/lib/rendering/protocol';

const sessionId = 'session_1234567890123456';
const requestId = 'request_12345678';

describe('renderer protocol', () => {
  it('round-trips a validated render request', () => {
    const request = createRendererRequest({
      sessionId,
      requestId,
      revision: 4,
      operation: 'render',
      source: 'flowchart LR\n  A --> B',
      theme: 'forest',
    });

    expect(parseRendererRequest(request, sessionId)).toEqual(request);
  });

  it('validates viewport commands separately from source operations', () => {
    const request = createRendererRequest({
      sessionId,
      requestId,
      revision: 4,
      operation: 'viewport',
      viewport: { action: 'zoom-by', factor: 1.25 },
    });

    expect(parseRendererRequest(request, sessionId)).toEqual(request);
    expect(
      parseRendererRequest(
        {
          ...request,
          payload: { action: 'zoom-by', factor: Number.POSITIVE_INFINITY },
        },
        sessionId,
      ),
    ).toBeUndefined();
  });

  it('rejects wrong sessions, future protocols, malformed revisions, and oversized source', () => {
    const base = {
      channel: RENDERER_PROTOCOL_CHANNEL,
      protocolVersion: RENDERER_PROTOCOL_VERSION,
      direction: 'host-to-renderer',
      kind: 'request',
      sessionId,
      requestId,
      revision: 1,
      operation: 'render',
      payload: { source: 'flowchart LR\nA-->B', theme: 'default' },
    };

    expect(parseRendererRequest(base, 'different_session_1234')).toBeUndefined();
    expect(parseRendererRequest({ ...base, protocolVersion: 2 }, sessionId)).toBeUndefined();
    expect(parseRendererRequest({ ...base, revision: -1 }, sessionId)).toBeUndefined();
    expect(
      parseRendererRequest(
        {
          ...base,
          payload: { ...base.payload, source: 'x'.repeat(MAX_MERMAID_SOURCE_LENGTH + 1) },
        },
        sessionId,
      ),
    ).toBeUndefined();
  });

  it('rejects malformed renderer responses', () => {
    const base = {
      channel: RENDERER_PROTOCOL_CHANNEL,
      protocolVersion: RENDERER_PROTOCOL_VERSION,
      direction: 'renderer-to-host',
      kind: 'result',
      sessionId,
      requestId,
      revision: 1,
      operation: 'render',
      payload: { svg: '<svg viewBox="0 0 10 10" />' },
    };

    expect(parseRendererResponse(base, sessionId)).toEqual(base);
    expect(parseRendererResponse({ ...base, payload: {} }, sessionId)).toBeUndefined();
    expect(
      parseRendererResponse(
        { ...base, payload: { svg: `<svg>${'x'.repeat(2_000_001)}</svg>` } },
        sessionId,
      ),
    ).toBeUndefined();
    expect(
      parseRendererResponse({ ...base, sessionId: 'other_session_123456' }, sessionId),
    ).toBeUndefined();
    expect(parseRendererResponse(Object.create({ ...base }), sessionId)).toBeUndefined();
  });
});
