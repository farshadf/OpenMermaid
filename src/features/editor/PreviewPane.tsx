import { useEffect, useRef, useState } from 'preact/hooks';

import { RendererFrameClient, RendererOperationError } from '@lib/rendering/client';
import type { SanitizedSvg } from '@lib/rendering/sanitize';

import { en } from '../../i18n/en';
import { Icon } from './Icon';

interface PreviewPaneProps {
  readonly active: boolean;
  readonly source: string;
  readonly revision: number;
  readonly theme: 'default' | 'neutral' | 'dark' | 'forest';
  readonly mobileHidden: boolean;
  readonly canFullscreen: boolean;
  readonly onSvgChange: (svg: SanitizedSvg | undefined, revision: number) => void;
  readonly onError: (error: Error | undefined, revision: number) => void;
  readonly onActivate: () => void;
}

type RenderStatus = 'waiting' | 'rendering' | 'ready' | 'error';

export function PreviewPane({
  active,
  source,
  revision,
  theme,
  mobileHidden,
  canFullscreen,
  onSvgChange,
  onError,
  onActivate,
}: PreviewPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const clientRef = useRef<RendererFrameClient>();
  const [status, setStatus] = useState<RenderStatus>('waiting');
  const [statusMessage, setStatusMessage] = useState<string>(en.editor.previewPane.startsOnDemand);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe === null) return;
    if (active) iframe.removeAttribute('tabindex');
    else iframe.tabIndex = -1;
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const iframe = iframeRef.current;
    if (iframe === null) return;

    const client = new RendererFrameClient({
      iframe,
      rendererUrl: '/renderer/',
      onReset: () => {
        setStatus('waiting');
        setStatusMessage(en.editor.previewPane.recovered);
      },
    });
    clientRef.current = client;

    return () => {
      client.dispose();
      clientRef.current = undefined;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const client = clientRef.current;
    if (client === undefined) return;

    // Keep the last valid diagram visible in the isolated frame, but revoke the
    // parent's export capability until this exact revision renders successfully.
    onSvgChange(undefined, revision);
    onError(undefined, revision);

    const timer = window.setTimeout(() => {
      setStatus('rendering');
      setStatusMessage(en.editor.previewPane.rendering);
      void client
        .render({ source, theme, revision })
        .then((result) => {
          if (result.revision !== revision) return;
          onSvgChange(result.svg, result.revision);
          onError(undefined, result.revision);
          setStatus('ready');
          setStatusMessage(
            result.diagramType === undefined
              ? en.editor.previewPane.ready
              : en.editor.previewPane.diagramReady(result.diagramType),
          );
        })
        .catch((reason: unknown) => {
          if (reason instanceof RendererOperationError && reason.code === 'stale') return;
          const error =
            reason instanceof Error ? reason : new Error(en.editor.previewPane.renderFailure);
          onSvgChange(undefined, revision);
          onError(error, revision);
          setStatus('error');
          setStatusMessage(error.message);
        });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [active, onError, onSvgChange, revision, source, theme]);

  const runViewportCommand = (command: 'zoomIn' | 'zoomOut' | 'fit' | 'reset') => {
    const client = clientRef.current;
    if (client === undefined) return;
    let operation: ReturnType<RendererFrameClient['fit']>;
    switch (command) {
      case 'zoomIn':
        operation = client.zoomBy(1.2);
        break;
      case 'zoomOut':
        operation = client.zoomBy(1 / 1.2);
        break;
      case 'fit':
        operation = client.fit();
        break;
      case 'reset':
        operation = client.resetViewport();
        break;
    }
    void operation.catch(() => setStatusMessage(en.editor.previewPane.controlUnavailable));
  };

  const requestFullscreen = async () => {
    if (!canFullscreen) return;
    const client = clientRef.current;
    if (client === undefined) return;
    try {
      await client.requestFullscreen();
    } catch {
      setStatusMessage(en.editor.previewPane.fullscreenUnavailable);
    }
  };

  return (
    <section
      id="preview-panel"
      role="tabpanel"
      class="editor-pane preview-pane"
      data-mobile-hidden={mobileHidden ? 'true' : 'false'}
      aria-labelledby="preview-tab"
    >
      <div class="pane-header">
        <h2 class="pane-heading" id="preview-heading">
          {en.editor.preview}
        </h2>
        <div class="pane-actions" aria-label={en.editor.previewPane.controls}>
          <button
            class="icon-button icon-button--quiet"
            type="button"
            onClick={() => runViewportCommand('zoomOut')}
            aria-label={en.editor.zoomOut}
            title={en.editor.zoomOut}
            disabled={!active || status === 'waiting'}
          >
            <Icon name="minus" size={16} />
          </button>
          <button
            class="icon-button icon-button--quiet"
            type="button"
            onClick={() => runViewportCommand('zoomIn')}
            aria-label={en.editor.zoomIn}
            title={en.editor.zoomIn}
            disabled={!active || status === 'waiting'}
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            class="icon-button icon-button--quiet"
            type="button"
            onClick={() => runViewportCommand('fit')}
            aria-label={en.editor.previewPane.fitDiagram}
            title={en.editor.previewPane.fitDiagram}
            disabled={!active || status === 'waiting'}
          >
            <Icon name="fit" size={16} />
          </button>
          <button
            class="icon-button icon-button--quiet"
            type="button"
            onClick={() => runViewportCommand('reset')}
            aria-label={en.editor.previewPane.resetView}
            title={en.editor.previewPane.resetView}
            disabled={!active || status === 'waiting'}
          >
            <Icon name="reset" size={16} />
          </button>
          <button
            class="icon-button icon-button--quiet"
            type="button"
            onClick={() => void requestFullscreen()}
            aria-label={en.editor.fullscreen}
            title={en.editor.fullscreen}
            disabled={!canFullscreen || !active || status === 'waiting'}
          >
            <Icon name="fullscreen" size={16} />
          </button>
        </div>
      </div>
      <div class="preview-stage">
        <iframe
          ref={iframeRef}
          class="preview-frame"
          src="about:blank"
          sandbox="allow-scripts"
          allow={canFullscreen ? 'fullscreen' : undefined}
          referrerPolicy="no-referrer"
          aria-hidden={active ? undefined : 'true'}
          title={en.editor.previewPane.frameTitle}
        />
        {!active ? (
          <button class="preview-start-button" type="button" onClick={onActivate}>
            <Icon name="fit" size={18} />
            {en.editor.previewPane.render}
          </button>
        ) : null}
        <div class="render-state" data-state={status} role="status" aria-live="polite">
          {statusMessage}
        </div>
      </div>
      <div class={`pane-status${status === 'error' ? ' pane-status--error' : ''}`}>
        {status === 'error'
          ? en.editor.previewPane.invalidHint
          : en.editor.previewPane.interactionHint}
      </div>
    </section>
  );
}
