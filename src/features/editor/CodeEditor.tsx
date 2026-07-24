import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { useEffect, useRef } from 'preact/hooks';

import { mermaidCompletionSource } from '@lib/mermaid-language/completion';
import { mermaidLanguage, mermaidSyntaxHighlighting } from '@lib/mermaid-language/language';
import { MAX_DOCUMENT_SOURCE_LENGTH } from '@lib/documents';

import { en } from '../../i18n/en';

export interface EditorDiagnostic {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

export type SourceTransformation =
  | { readonly kind: 'passthrough' }
  | { readonly kind: 'reject' }
  | { readonly kind: 'replace'; readonly source: string; readonly announcement: string };

export interface CodeEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onExternalPaste: (text: string) => SourceTransformation;
  readonly onNormalizeSource: (source: string) => SourceTransformation;
  readonly onPasteLimit: () => void;
  readonly onTransformationApplied: (announcement: string) => void;
  readonly normalizeRequest: number;
  readonly diagnostic?: EditorDiagnostic | undefined;
  readonly ariaLabel: string;
  readonly restoreFocus?: boolean;
}

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--editor-code-bg)',
    color: 'var(--editor-code-text)',
    fontSize: '0.875rem',
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.65',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    padding: '1rem 0',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-code-bg)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border-subtle)',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'var(--surface-active)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-tooltip': {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--surface-elevated)',
    color: 'var(--text)',
    boxShadow: 'var(--shadow-lg)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--text)',
  },
});

function diagnosticRange(
  view: EditorView,
  diagnostic: EditorDiagnostic,
): Pick<Diagnostic, 'from' | 'to'> {
  if (diagnostic.line === undefined) return { from: 0, to: Math.min(1, view.state.doc.length) };

  const lineNumber = Math.max(1, Math.min(diagnostic.line, view.state.doc.lines));
  const line = view.state.doc.line(lineNumber);
  const column = Math.max(0, diagnostic.column ?? 0);
  const from = Math.min(line.to, line.from + column);
  return { from, to: Math.min(line.to, from + 1) };
}

export function CodeEditor({
  value,
  onChange,
  onExternalPaste,
  onNormalizeSource,
  onPasteLimit,
  onTransformationApplied,
  normalizeRequest,
  diagnostic,
  ariaLabel,
  restoreFocus,
}: CodeEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const onChangeRef = useRef(onChange);
  const onExternalPasteRef = useRef(onExternalPaste);
  const onNormalizeSourceRef = useRef(onNormalizeSource);
  const onPasteLimitRef = useRef(onPasteLimit);
  const onTransformationAppliedRef = useRef(onTransformationApplied);
  const handledNormalizeRequestRef = useRef(normalizeRequest);
  const applyingExternalValueRef = useRef(false);

  onChangeRef.current = onChange;
  onExternalPasteRef.current = onExternalPaste;
  onNormalizeSourceRef.current = onNormalizeSource;
  onPasteLimitRef.current = onPasteLimit;
  onTransformationAppliedRef.current = onTransformationApplied;

  useEffect(() => {
    if (mountRef.current === null) return;

    const view = new EditorView({
      parent: mountRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          EditorState.transactionFilter.of((transaction) =>
            transaction.newDoc.length <= MAX_DOCUMENT_SOURCE_LENGTH ? transaction : [],
          ),
          indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ override: [mermaidCompletionSource], activateOnTyping: true }),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          lintGutter(),
          mermaidLanguage,
          mermaidSyntaxHighlighting,
          editorTheme,
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.contentAttributes.of({
            'aria-label': ariaLabel,
            'aria-multiline': 'true',
            spellcheck: 'false',
            autocapitalize: 'off',
            autocomplete: 'off',
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingExternalValueRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            paste(event, editorView) {
              const clipboardSource = event.clipboardData?.getData('text/plain');
              if (clipboardSource === undefined) return false;
              const transformed = onExternalPasteRef.current(clipboardSource);
              if (transformed.kind === 'passthrough') return false;

              event.preventDefault();
              if (transformed.kind === 'reject') return true;

              const selectedLength = editorView.state.selection.ranges.reduce(
                (total, range) => total + range.to - range.from,
                0,
              );
              const nextLength =
                editorView.state.doc.length -
                selectedLength +
                transformed.source.length * editorView.state.selection.ranges.length;
              if (nextLength > MAX_DOCUMENT_SOURCE_LENGTH) {
                onPasteLimitRef.current();
                return true;
              }

              editorView.dispatch(editorView.state.replaceSelection(transformed.source), {
                annotations: Transaction.userEvent.of('input.paste'),
              });
              onTransformationAppliedRef.current(transformed.announcement);
              return true;
            },
          }),
        ],
      }),
    });

    viewRef.current = view;
    if (restoreFocus) view.focus();
    return () => {
      view.destroy();
      viewRef.current = undefined;
    };
  }, [ariaLabel, restoreFocus]);

  useEffect(() => {
    const view = viewRef.current;
    if (view === undefined) return;
    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;

    applyingExternalValueRef.current = true;
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: { anchor: Math.min(view.state.selection.main.head, value.length) },
        annotations: Transaction.addToHistory.of(false),
      });
    } finally {
      applyingExternalValueRef.current = false;
    }
  }, [value]);

  useEffect(() => {
    if (handledNormalizeRequestRef.current === normalizeRequest) return;
    handledNormalizeRequestRef.current = normalizeRequest;
    const view = viewRef.current;
    if (view === undefined) return;

    const transformed = onNormalizeSourceRef.current(view.state.doc.toString());
    if (
      transformed.kind !== 'replace' ||
      transformed.source === view.state.doc.toString() ||
      transformed.source.length > MAX_DOCUMENT_SOURCE_LENGTH
    ) {
      return;
    }

    const selection = EditorSelection.create(
      view.state.selection.ranges.map((range) =>
        EditorSelection.range(
          Math.min(range.anchor, transformed.source.length),
          Math.min(range.head, transformed.source.length),
        ),
      ),
      view.state.selection.mainIndex,
    );
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: transformed.source },
      selection,
      annotations: Transaction.userEvent.of('input.normalize'),
    });
    onTransformationAppliedRef.current(transformed.announcement);
  }, [normalizeRequest]);

  useEffect(() => {
    const view = viewRef.current;
    if (view === undefined) return;

    if (diagnostic === undefined) {
      view.dispatch(setDiagnostics(view.state, []));
      return;
    }

    view.dispatch(
      setDiagnostics(view.state, [
        {
          ...diagnosticRange(view, diagnostic),
          severity: 'error',
          message: diagnostic.message,
          source: en.editor.sourcePane.diagnosticSource,
        },
      ]),
    );
  }, [diagnostic]);

  return <div class="code-editor" ref={mountRef} />;
}
