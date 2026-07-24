import type { ComponentType } from 'preact';
import { useRef, useState } from 'preact/hooks';

import { MAX_DOCUMENT_SOURCE_LENGTH } from '@lib/documents';

import { en } from '../../i18n/en';
import type { CodeEditorProps, EditorDiagnostic, SourceTransformation } from './CodeEditor';
import { Icon } from './Icon';

interface SourcePaneProps {
  readonly documentId: string;
  readonly source: string;
  readonly diagnostic?: EditorDiagnostic | undefined;
  readonly mobileHidden: boolean;
  readonly canImport: boolean;
  readonly onChange: (source: string) => void;
  readonly onExternalPaste: (text: string) => SourceTransformation;
  readonly onNormalizeSource: (source: string) => SourceTransformation;
  readonly onPasteLimit: () => void;
  readonly onTransformationApplied: (announcement: string) => void;
  readonly onCopy: () => void;
  readonly onImport: () => void;
}

export function SourcePane({
  documentId,
  source,
  diagnostic,
  mobileHidden,
  canImport,
  onChange,
  onExternalPaste,
  onNormalizeSource,
  onPasteLimit,
  onTransformationApplied,
  onCopy,
  onImport,
}: SourcePaneProps) {
  const [LoadedCodeEditor, setLoadedCodeEditor] = useState<ComponentType<CodeEditorProps>>();
  const [normalizeRequest, setNormalizeRequest] = useState(0);
  const loadEditorRef = useRef<Promise<void>>();

  const enhanceEditor = () => {
    if (LoadedCodeEditor !== undefined || loadEditorRef.current !== undefined) return;
    loadEditorRef.current = import('./CodeEditor')
      .then(({ CodeEditor }) => setLoadedCodeEditor(() => CodeEditor))
      .catch(() => {
        loadEditorRef.current = undefined;
      });
  };

  return (
    <section
      id="source-panel"
      role="tabpanel"
      class="editor-pane source-pane"
      data-mobile-hidden={mobileHidden ? 'true' : 'false'}
      aria-labelledby="source-tab"
    >
      <div class="pane-header">
        <h2 class="pane-heading" id="source-heading">
          {en.editor.source}
        </h2>
        <div class="pane-actions" aria-label={en.editor.sourcePane.controls}>
          {LoadedCodeEditor === undefined ? (
            <button
              class="icon-button icon-button--quiet"
              type="button"
              onClick={enhanceEditor}
              aria-label={en.editor.sourcePane.enableAdvanced}
              title={en.editor.sourcePane.enableAdvancedTitle}
            >
              <Icon name="edit" size={16} />
            </button>
          ) : null}
          <button
            class="icon-button icon-button--quiet"
            type="button"
            onClick={() => {
              if (LoadedCodeEditor !== undefined) {
                setNormalizeRequest((current) => current + 1);
                return;
              }
              const transformed = onNormalizeSource(source);
              if (transformed.kind !== 'replace' || transformed.source === source) return;
              onChange(transformed.source);
              onTransformationApplied(transformed.announcement);
            }}
            aria-label={en.editor.sourcePane.normalize}
            title={en.editor.sourcePane.normalizeTitle}
          >
            <Icon name="normalize" size={16} />
          </button>
          {canImport ? (
            <button
              class="icon-button icon-button--quiet"
              type="button"
              onClick={onImport}
              aria-label={en.editor.sourcePane.importFile}
              title={en.editor.sourcePane.importFile}
            >
              <Icon name="import" size={16} />
            </button>
          ) : null}
          <button
            class="icon-button icon-button--quiet"
            type="button"
            onClick={onCopy}
            aria-label={en.editor.copySource}
            title={en.editor.copySource}
          >
            <Icon name="copy" size={16} />
          </button>
        </div>
      </div>
      {LoadedCodeEditor === undefined ? (
        <textarea
          class="source-textarea"
          value={source}
          maxLength={MAX_DOCUMENT_SOURCE_LENGTH}
          aria-label={en.editor.sourcePane.sourceLabel}
          aria-multiline="true"
          spellcheck={false}
          autocapitalize="off"
          autocomplete="off"
          onPaste={(event) => {
            const clipboardSource = event.clipboardData?.getData('text/plain');
            if (clipboardSource === undefined) return;
            const transformed = onExternalPaste(clipboardSource);
            if (transformed.kind === 'passthrough') return;

            event.preventDefault();
            if (transformed.kind === 'reject') return;
            const target = event.currentTarget;
            const selectionStart = target.selectionStart;
            const selectionEnd = target.selectionEnd;
            const nextSource = `${target.value.slice(0, selectionStart)}${transformed.source}${target.value.slice(selectionEnd)}`;
            if (nextSource.length > MAX_DOCUMENT_SOURCE_LENGTH) {
              onPasteLimit();
              return;
            }
            onChange(nextSource);
            onTransformationApplied(transformed.announcement);

            const nextCursor = selectionStart + transformed.source.length;
            requestAnimationFrame(() => {
              target.focus();
              target.setSelectionRange(nextCursor, nextCursor);
            });
          }}
          onInput={(event) => {
            onChange(event.currentTarget.value);
          }}
        />
      ) : (
        <LoadedCodeEditor
          key={documentId}
          value={source}
          onChange={onChange}
          onExternalPaste={onExternalPaste}
          onNormalizeSource={onNormalizeSource}
          onPasteLimit={onPasteLimit}
          onTransformationApplied={onTransformationApplied}
          normalizeRequest={normalizeRequest}
          diagnostic={diagnostic}
          ariaLabel={en.editor.sourcePane.sourceLabel}
          restoreFocus
        />
      )}
      <div
        class={`pane-status${diagnostic === undefined ? '' : ' pane-status--error'}`}
        aria-live="polite"
      >
        {diagnostic === undefined
          ? en.editor.sourcePane.characterCount(source.length)
          : diagnostic.message}
      </div>
    </section>
  );
}
