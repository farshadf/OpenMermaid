import type { MermaidConfig } from 'mermaid';

import { MAX_MERMAID_SOURCE_LENGTH, MERMAID_SECURE_KEYS, type MermaidTheme } from './constants';
import {
  createRendererResponseBase,
  parseRendererRequest,
  type RendererErrorCode,
  type RendererErrorMessage,
  type RendererRequestMessage,
  type RendererResultMessage,
  type RendererViewportRequestMessage,
} from './protocol';
import { SerializedTaskQueue } from './queue';
import { sanitizeSvg, sanitizedSvgToElement } from './sanitize';
import { PreviewViewport } from './viewport';

const SESSION_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;

function createSecureMermaidConfig(theme: MermaidTheme): Readonly<MermaidConfig> {
  const secureKeys = Object.freeze([...MERMAID_SECURE_KEYS]) as unknown as string[];
  return Object.freeze({
    startOnLoad: false,
    securityLevel: 'strict',
    secure: secureKeys,
    maxTextSize: MAX_MERMAID_SOURCE_LENGTH,
    maxEdges: 500,
    suppressErrorRendering: true,
    theme,
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
    logLevel: 'fatal',
  });
}

function readSessionId(): string | undefined {
  const sessionId = new URLSearchParams(location.hash.slice(1)).get('session') ?? undefined;
  return sessionId && SESSION_PATTERN.test(sessionId) ? sessionId : undefined;
}

function cleanErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (
    Array.from(message)
      .filter((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return (
          codePoint === 9 ||
          codePoint === 10 ||
          codePoint === 13 ||
          (codePoint >= 32 && codePoint !== 127)
        );
      })
      .join('')
      .trim()
      .slice(0, 600) || 'The diagram could not be rendered.'
  );
}

function classifyError(request: RendererRequestMessage): RendererErrorCode {
  return request.operation === 'parse' ? 'invalid-source' : 'render-failed';
}

export async function startRendererFrame(): Promise<void> {
  const sessionId = readSessionId();
  const surface = document.querySelector<HTMLElement>('[data-renderer-surface]');
  const scene = document.querySelector<HTMLElement>('[data-renderer-scene]');
  const status = document.querySelector<HTMLElement>('[data-renderer-status]');

  if (!sessionId || !surface || !scene || !status) {
    document.body.textContent = 'The isolated renderer could not start.';
    return;
  }

  const mermaidModule = await import('mermaid');
  const mermaid = mermaidModule.default;
  const queue = new SerializedTaskQueue();
  let pinnedHostOrigin: string | undefined;
  let latestRenderRevision = -1;
  let renderSequence = 0;

  const announceViewport = (scale: number): void => {
    status.textContent = `Preview zoom ${String(Math.round(scale * 100))}%.`;
  };
  const viewport = new PreviewViewport({
    surface,
    scene,
    onChange: ({ scale }) => {
      announceViewport(scale);
    },
  });

  const post = (message: RendererResultMessage | RendererErrorMessage): void => {
    if (pinnedHostOrigin) {
      window.parent.postMessage(message, pinnedHostOrigin);
    }
  };

  const postError = (
    request: RendererRequestMessage,
    code: RendererErrorCode,
    message: string,
  ): void => {
    post({
      ...createRendererResponseBase(sessionId),
      kind: 'error',
      requestId: request.requestId,
      revision: request.revision,
      operation: request.operation,
      payload: { code, message },
    });
  };

  const handleViewport = (request: RendererViewportRequestMessage): void => {
    const { action } = request.payload;
    const viewportState =
      action === 'fit'
        ? viewport.fit()
        : action === 'reset'
          ? viewport.reset()
          : action === 'zoom-by'
            ? viewport.zoomBy(request.payload.factor ?? 1)
            : viewport.panBy(request.payload.x ?? 0, request.payload.y ?? 0);

    post({
      ...createRendererResponseBase(sessionId),
      kind: 'result',
      requestId: request.requestId,
      revision: request.revision,
      operation: 'viewport',
      payload: { viewport: viewportState },
    });
  };

  const handleSourceOperation = async (request: RendererRequestMessage): Promise<void> => {
    if (request.operation === 'viewport') {
      handleViewport(request);
      return;
    }

    if (!request.payload.source.trim()) {
      postError(request, 'invalid-source', 'Enter Mermaid source to render a diagram.');
      return;
    }

    if (request.operation === 'render' && request.revision < latestRenderRevision) {
      postError(request, 'stale', 'A newer diagram revision is already queued.');
      return;
    }

    status.textContent = request.operation === 'render' ? 'Rendering preview…' : 'Checking source…';
    const staging = document.createElement('div');
    staging.className = 'renderer-staging';
    document.body.append(staging);

    try {
      mermaid.initialize(createSecureMermaidConfig(request.payload.theme));
      const metadata = await mermaid.parse(request.payload.source, { suppressErrors: false });
      const diagramType = metadata.diagramType;

      if (request.operation === 'parse') {
        post({
          ...createRendererResponseBase(sessionId),
          kind: 'result',
          requestId: request.requestId,
          revision: request.revision,
          operation: request.operation,
          payload: diagramType ? { diagramType } : {},
        });
        status.textContent = 'Source is valid Mermaid.';
        return;
      }

      renderSequence += 1;
      const renderId = `openmermaid${String(request.revision)}x${String(renderSequence)}`;
      const rendered = await mermaid.render(renderId, request.payload.source, staging);

      if (request.revision < latestRenderRevision) {
        postError(request, 'stale', 'A newer diagram revision replaced this result.');
        return;
      }

      const sanitized = sanitizeSvg(rendered.svg);
      scene.replaceChildren(sanitizedSvgToElement(sanitized));
      viewport.contentChanged();
      status.textContent = 'Preview updated.';

      post({
        ...createRendererResponseBase(sessionId),
        kind: 'result',
        requestId: request.requestId,
        revision: request.revision,
        operation: request.operation,
        payload: {
          ...(diagramType ? { diagramType } : {}),
          svg: sanitized.markup,
        },
      });
    } catch (error) {
      // The scene is deliberately unchanged: invalid revisions retain the last valid preview.
      status.textContent = 'Preview not updated because the source is invalid.';
      postError(request, classifyError(request), cleanErrorMessage(error));
    } finally {
      staging.remove();
    }
  };

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) {
      return;
    }

    const rendererOrigin = new URL(location.href).origin;
    if (event.origin !== rendererOrigin) {
      return;
    }
    pinnedHostOrigin ??= event.origin;
    if (event.origin !== pinnedHostOrigin) {
      return;
    }

    const request = parseRendererRequest(event.data, sessionId);
    if (!request) {
      return;
    }
    if (request.operation === 'render') {
      latestRenderRevision = Math.max(latestRenderRevision, request.revision);
    }

    void queue.enqueue(() => handleSourceOperation(request));
  });

  window.parent.postMessage(
    {
      ...createRendererResponseBase(sessionId),
      kind: 'ready',
    },
    '*',
  );
}
