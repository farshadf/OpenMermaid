import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { copyText } from '@lib/browser/clipboard';
import {
  MAX_DOCUMENT_TITLE_LENGTH,
  MAX_DOCUMENT_SOURCE_LENGTH,
  createStandaloneEditorHostBridge,
  createDiagramDocument,
  documentToShareEnvelope,
  shareEnvelopeToDocument,
  updateDiagramDocument,
  type DiagramBackground,
  type DiagramDocumentV1,
  type DiagramRepository,
  type DiagramTheme,
  type EditorHostBridge,
} from '@lib/documents';
import {
  createSourceDownload,
  downloadBlob,
  importDiagramFile,
  normalizeMermaidSource,
  type MermaidSourceNormalizationReport,
} from '@lib/import-export';
import {
  defaultMermaidSource,
  mermaidDiagramCatalog,
  type MermaidDiagramCatalogEntry,
} from '@lib/mermaid-language/catalog';
import {
  copySanitizedSvg,
  downloadPng,
  downloadSanitizedSvg,
  type PngScale,
  type SanitizedSvg,
} from '@lib/rendering';
import { clearLocalVitalsHistory } from '@lib/performance';
import {
  MAX_SHARE_URL_LENGTH,
  ShareCodecError,
  decodeShareHash,
  encodeShareHash,
} from '@lib/share';
import {
  AutosaveCoordinator,
  DeleteUndoManager,
  IndexedDbDiagramRepository,
  RevisionConflictError,
  clearRecoveryJournal,
  readRecoveryJournal,
  writeRecoveryJournal,
  type AutosaveSnapshot,
  type UndoableDeletion,
} from '@lib/storage';

import { en } from '../../i18n/en';
import type { SourceTransformation } from './CodeEditor';
import { DocumentLibrary } from './DocumentLibrary';
import { ExportDialog } from './ExportDialog';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { PreviewPane } from './PreviewPane';
import { ShareDialog } from './ShareDialog';
import { SourcePane } from './SourcePane';
import { TemplateDialog } from './TemplateDialog';
import { VolatileDiagramRepository } from './VolatileDiagramRepository';
import { useColorScheme } from './useColorScheme';
import { usePaneResize } from './usePaneResize';

type MobilePane = 'source' | 'preview';
type StorageMode = 'indexeddb' | 'volatile';
type DialogName = 'templates' | 'share' | 'export' | 'clear' | undefined;

interface ToastState {
  readonly id: number;
  readonly message: string;
  readonly tone?: 'default' | 'error';
}

interface ConflictState {
  readonly local: DiagramDocumentV1;
  readonly stored: DiagramDocumentV1;
}

interface EditorRepository extends DiagramRepository {
  clear(): Promise<void>;
  close?(): Promise<void>;
  subscribe?: IndexedDbDiagramRepository['subscribe'];
}

export interface EditorAppProps {
  readonly hostBridge?: EditorHostBridge;
}

const standaloneHostBridge = createStandaloneEditorHostBridge();

function sameEditableContent(left: DiagramDocumentV1, right: DiagramDocumentV1): boolean {
  return (
    left.title === right.title &&
    left.source === right.source &&
    left.appearance.theme === right.appearance.theme &&
    left.appearance.background === right.appearance.background
  );
}

function errorMessage(error: unknown, fallback: string = en.editor.shell.genericError): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

function normalizationCount(
  entries: MermaidSourceNormalizationReport['changes' | 'warnings'],
): number {
  return entries.reduce((total, entry) => total + entry.count, 0);
}

function hasMultipleMermaidBlocks(report: MermaidSourceNormalizationReport): boolean {
  return report.warnings.some(({ code }) => code === 'multiple-mermaid-blocks');
}

function cleanupSummary(
  kind: 'paste' | 'source',
  report: MermaidSourceNormalizationReport,
): string {
  const fixes = normalizationCount(report.changes);
  const warnings = normalizationCount(report.warnings);
  return kind === 'paste'
    ? en.editor.messages.pastedSourceCleaned(fixes, warnings)
    : en.editor.messages.sourceCleaned(fixes, warnings);
}

function titleWithSuffix(title: string, suffix: string): string {
  const available = Math.max(0, MAX_DOCUMENT_TITLE_LENGTH - suffix.length);
  return `${title.slice(0, available).trimEnd()}${suffix}`;
}

function diagnosticFromError(error: Error | undefined) {
  if (error === undefined) return undefined;
  const lineMatch = /(?:line|at)\s+(\d+)(?::(\d+))?/iu.exec(error.message);
  return {
    message: error.message,
    ...(lineMatch?.[1] === undefined ? {} : { line: Number(lineMatch[1]) }),
    ...(lineMatch?.[2] === undefined ? {} : { column: Math.max(0, Number(lineMatch[2]) - 1) }),
  };
}

export function EditorApp({ hostBridge = standaloneHostBridge }: EditorAppProps) {
  const [documents, setDocuments] = useState<DiagramDocumentV1[]>([]);
  const [draft, setDraft] = useState<DiagramDocumentV1>();
  const [ready, setReady] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>('indexeddb');
  const [saveSnapshot, setSaveSnapshot] = useState<AutosaveSnapshot>({ state: 'idle' });
  const [query, setQuery] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>('source');
  const [dialog, setDialog] = useState<DialogName>();
  const [shareUrl, setShareUrl] = useState<string>();
  const [shareError, setShareError] = useState<string>();
  const [sanitizedSvg, setSanitizedSvg] = useState<SanitizedSvg>();
  const [renderError, setRenderError] = useState<Error>();
  const [renderRevision, setRenderRevision] = useState(0);
  const [rendererActive, setRendererActive] = useState(false);
  const [pngScale, setPngScale] = useState<PngScale>(2);
  const [exportBusy, setExportBusy] = useState(false);
  const [conflict, setConflict] = useState<ConflictState>();
  const [toast, setToast] = useState<ToastState>();
  const [undoDeletions, setUndoDeletions] = useState<UndoableDeletion[]>([]);

  const repositoryRef = useRef<EditorRepository>();
  const autosaveRef = useRef<AutosaveCoordinator>();
  const deleteUndoRef = useRef<DeleteUndoManager>();
  const savedRevisionsRef = useRef(new Map<string, number>());
  const activeIdRef = useRef<string>();
  const dirtyRef = useRef(false);
  const draftRef = useRef<DiagramDocumentV1>();
  const renderRevisionRef = useRef(0);
  const toastSequenceRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const libraryButtonRef = useRef<HTMLButtonElement>(null);
  const libraryWasOpenRef = useRef(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const { sourcePercent, dragging, separatorProps } = usePaneResize(splitRef);
  const { preference: colorScheme, setPreference: setColorScheme } = useColorScheme();

  const commitDraft = useCallback((document: DiagramDocumentV1) => {
    draftRef.current = document;
    activeIdRef.current = document.id;
    setDraft(document);
  }, []);

  const showToast = useCallback((message: string, options: Pick<ToastState, 'tone'> = {}) => {
    toastSequenceRef.current += 1;
    setToast({ id: toastSequenceRef.current, message, ...options });
  }, []);

  useEffect(() => {
    if (toast === undefined) return;
    const timer = window.setTimeout(
      () => setToast((current) => (current?.id === toast.id ? undefined : current)),
      8_000,
    );
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (libraryWasOpenRef.current && !libraryOpen) libraryButtonRef.current?.focus();
    libraryWasOpenRef.current = libraryOpen;
  }, [libraryOpen]);

  const replaceDocumentInList = useCallback((document: DiagramDocumentV1) => {
    setDocuments((current) => {
      const without = current.filter(({ id }) => id !== document.id);
      return [document, ...without].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
    });
  }, []);

  const invalidateRenderedOutput = useCallback(() => {
    renderRevisionRef.current += 1;
    setRenderRevision(renderRevisionRef.current);
    setSanitizedSvg(undefined);
    setRenderError(undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let persistPendingDraft: (() => void) | undefined;
    let persistWhenHidden: (() => void) | undefined;

    const initialize = async () => {
      let repository: EditorRepository = new IndexedDbDiagramRepository();
      let mode: StorageMode = 'indexeddb';
      let initialDocuments: DiagramDocumentV1[];

      try {
        initialDocuments = await repository.list();
        if (
          repository instanceof IndexedDbDiagramRepository &&
          repository.lastSkippedRecordCount > 0
        ) {
          showToast(en.editor.messages.unreadableRecords(repository.lastSkippedRecordCount), {
            tone: 'error',
          });
        }
      } catch {
        await repository.close?.();
        repository = new VolatileDiagramRepository();
        mode = 'volatile';
        initialDocuments = [];
      }

      const putDuringBootstrap = async (document: DiagramDocumentV1) => {
        try {
          await repository.put(document);
        } catch (error) {
          if (mode === 'volatile') throw error;
          await repository.close?.();
          repository = new VolatileDiagramRepository();
          mode = 'volatile';
          initialDocuments = [];
          await repository.put(document);
        }
      };

      if (cancelled) {
        await repository.close?.();
        return;
      }

      const recoveryEntry = readRecoveryJournal();
      if (recoveryEntry !== undefined) {
        const pendingRecovery = recoveryEntry.document;
        const stored = initialDocuments.find(({ id }) => id === pendingRecovery.id);
        if (stored !== undefined && sameEditableContent(stored, pendingRecovery)) {
          clearRecoveryJournal(pendingRecovery);
        } else {
          const canRestoreOriginal =
            stored === undefined || stored.revision === recoveryEntry.expectedRevision;
          const recovered = canRestoreOriginal
            ? {
                ...pendingRecovery,
                revision: stored === undefined ? 0 : stored.revision + 1,
                updatedAt: new Date().toISOString(),
              }
            : createDiagramDocument({
                title: titleWithSuffix(pendingRecovery.title, en.editor.shell.recoveredSuffix),
                source: pendingRecovery.source,
                appearance: pendingRecovery.appearance,
                createdWithMermaid: pendingRecovery.createdWithMermaid,
              });
          await putDuringBootstrap(recovered);
          initialDocuments = [
            recovered,
            ...initialDocuments.filter(({ id }) => id !== recovered.id),
          ];
          clearRecoveryJournal(pendingRecovery);
          showToast(en.editor.messages.recoveredEdits);
        }
      }

      if (/^#v\d+:/u.test(location.hash)) {
        try {
          const shared = shareEnvelopeToDocument(decodeShareHash(location.hash));
          await putDuringBootstrap(shared);
          initialDocuments = [shared, ...initialDocuments.filter(({ id }) => id !== shared.id)];
          const cleanUrl = new URL(location.href);
          cleanUrl.hash = '';
          cleanUrl.searchParams.delete('template');
          history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}`);
          showToast(en.editor.messages.sharedSnapshotOpened);
        } catch (error) {
          showToast(errorMessage(error, en.editor.messages.shareLinkOpenFailed), {
            tone: 'error',
          });
        }
      } else {
        const requestedTemplate = new URLSearchParams(location.search)
          .get('template')
          ?.replace(/-starter$/u, '');
        const template = mermaidDiagramCatalog.find(({ id }) => id === requestedTemplate);
        if (template !== undefined) {
          const fromTemplate = createDiagramDocument({
            title: template.label,
            source: template.source,
          });
          await putDuringBootstrap(fromTemplate);
          initialDocuments = [
            fromTemplate,
            ...initialDocuments.filter(({ id }) => id !== fromTemplate.id),
          ];
          const cleanUrl = new URL(location.href);
          cleanUrl.searchParams.delete('template');
          history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}`);
          showToast(en.editor.messages.createdFromTemplate(template.label));
        }
      }

      if (initialDocuments.length === 0) {
        const starter = createDiagramDocument({
          title: en.editor.shell.welcomeDiagram,
          source: defaultMermaidSource,
        });
        await putDuringBootstrap(starter);
        initialDocuments = [starter];
      }

      const first = initialDocuments[0];
      if (first === undefined) return;
      for (const document of initialDocuments)
        savedRevisionsRef.current.set(document.id, document.revision);

      repositoryRef.current = repository;
      setStorageMode(mode);
      setDocuments(initialDocuments);
      commitDraft(first);
      setReady(true);

      const autosave = new AutosaveCoordinator({
        delayMs: 550,
        onStateChange: (snapshot) => {
          setSaveSnapshot(snapshot);
          if (snapshot.state === 'idle') dirtyRef.current = false;
          if (
            snapshot.state === 'error' &&
            snapshot.error instanceof RevisionConflictError &&
            draftRef.current !== undefined
          ) {
            setConflict({ local: draftRef.current, stored: snapshot.error.storedDocument });
          }
        },
        save: async (nextDraft) => {
          const stored = await repository.get(nextDraft.id);
          const expectedRevision = savedRevisionsRef.current.get(nextDraft.id);
          if (stored === undefined && expectedRevision !== undefined) {
            throw new Error(en.editor.messages.removedInAnotherTab);
          }
          if (
            stored !== undefined &&
            expectedRevision !== undefined &&
            stored.revision !== expectedRevision
          ) {
            throw new RevisionConflictError(nextDraft, stored);
          }
          const persisted: DiagramDocumentV1 = {
            ...nextDraft,
            revision: stored === undefined ? 0 : stored.revision + 1,
            updatedAt: new Date().toISOString(),
          };
          await repository.put(persisted);
          clearRecoveryJournal(nextDraft);
          savedRevisionsRef.current.set(persisted.id, persisted.revision);
          replaceDocumentInList(persisted);
          const current = draftRef.current;
          if (current?.id === persisted.id) {
            const synchronized = sameEditableContent(current, persisted)
              ? persisted
              : { ...current, revision: persisted.revision };
            // Preact state setters may replace another update queued in the same
            // event turn. Keep the synchronous draft ref authoritative so a
            // completed older save can never roll back newer typing.
            commitDraft(synchronized);
          }
        },
      });
      autosaveRef.current = autosave;
      deleteUndoRef.current = new DeleteUndoManager(repository);

      persistPendingDraft = () => {
        void autosave.flush().catch(() => {
          // The visible save state remains the recovery path while the page is open.
        });
      };
      persistWhenHidden = () => {
        if (document.visibilityState === 'hidden') persistPendingDraft?.();
      };
      window.addEventListener('pagehide', persistPendingDraft, { capture: true });
      document.addEventListener('visibilitychange', persistWhenHidden);

      if (repository.subscribe !== undefined) {
        unsubscribe = repository.subscribe((event) => {
          if (event.origin !== 'external') return;
          void (async () => {
            const refreshed = await repository.list();
            setDocuments(refreshed);
            const eventId = event.id;
            if (event.kind === 'put' && eventId !== undefined && eventId === activeIdRef.current) {
              const stored = await repository.get(eventId);
              const local = draftRef.current;
              if (stored === undefined || local === undefined) return;
              if (dirtyRef.current) setConflict({ local, stored });
              else {
                savedRevisionsRef.current.set(stored.id, stored.revision);
                commitDraft(stored);
                invalidateRenderedOutput();
              }
            }
            const activeWasRemoved =
              (event.kind === 'delete' && event.id === activeIdRef.current) ||
              event.kind === 'clear';
            if (activeWasRemoved) {
              const local = draftRef.current;
              const preserveLocalChanges = dirtyRef.current && local !== undefined;
              await autosave.cancelAndWait();

              let replacement = refreshed[0];
              if (preserveLocalChanges) {
                replacement = createDiagramDocument({
                  title: titleWithSuffix(local.title, en.editor.shell.recoveredCopySuffix),
                  source: local.source,
                  appearance: local.appearance,
                  createdWithMermaid: local.createdWithMermaid,
                });
                await repository.put(replacement);
                clearRecoveryJournal(local);
              } else if (replacement === undefined) {
                replacement = createDiagramDocument({
                  title: en.editor.shell.welcomeDiagram,
                  source: defaultMermaidSource,
                });
                await repository.put(replacement);
              }

              savedRevisionsRef.current.set(replacement.id, replacement.revision);
              setDocuments(await repository.list());
              commitDraft(replacement);
              dirtyRef.current = false;
              invalidateRenderedOutput();
              showToast(
                preserveLocalChanges
                  ? en.editor.messages.anotherTabRemovedDiagram
                  : en.editor.messages.anotherTabClearedData,
                { tone: 'error' },
              );
            }
          })().catch((error: unknown) => showToast(errorMessage(error), { tone: 'error' }));
        });
      }

      if (mode === 'volatile') {
        showToast(en.editor.messages.volatileStorage, { tone: 'error' });
      }
    };

    void initialize().catch((error: unknown) => {
      showToast(errorMessage(error, en.editor.messages.initializationFailed), { tone: 'error' });
      setReady(true);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (persistPendingDraft !== undefined) {
        window.removeEventListener('pagehide', persistPendingDraft, { capture: true });
      }
      if (persistWhenHidden !== undefined) {
        document.removeEventListener('visibilitychange', persistWhenHidden);
      }
      const autosave = autosaveRef.current;
      const repository = repositoryRef.current;
      void (async () => {
        try {
          await autosave?.flush();
        } catch {
          // A page transition cannot present recovery UI; keep the last stored revision.
        } finally {
          autosave?.dispose();
          await repository?.close?.();
        }
      })();
      deleteUndoRef.current?.dispose();
    };
  }, [commitDraft, invalidateRenderedOutput, replaceDocumentInList, showToast]);

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length === 0) return documents;
    return documents.filter((document) =>
      `${document.title}\n${document.source}`.toLocaleLowerCase().includes(normalized),
    );
  }, [documents, query]);

  const mutateDraft = useCallback(
    (patch: Parameters<typeof updateDiagramDocument>[1]) => {
      const current = draftRef.current;
      if (current === undefined) return;
      const next = updateDiagramDocument(current, patch);
      commitDraft(next);
      dirtyRef.current = true;
      replaceDocumentInList(next);
      writeRecoveryJournal(next, savedRevisionsRef.current.get(next.id));
      autosaveRef.current?.schedule(next);
      invalidateRenderedOutput();
    },
    [commitDraft, invalidateRenderedOutput, replaceDocumentInList],
  );

  const flushAutosave = useCallback(async (): Promise<boolean> => {
    try {
      await autosaveRef.current?.flush();
      return true;
    } catch (error) {
      if (error instanceof RevisionConflictError && draftRef.current !== undefined) {
        setConflict({ local: draftRef.current, stored: error.storedDocument });
      }
      showToast(errorMessage(error, en.editor.messages.saveFailed), { tone: 'error' });
      return false;
    }
  }, [showToast]);

  const createDocument = useCallback(
    async (
      options: Parameters<typeof createDiagramDocument>[0] = {},
    ): Promise<DiagramDocumentV1 | undefined> => {
      if (!(await flushAutosave())) return undefined;
      const repository = repositoryRef.current;
      if (repository === undefined) return undefined;
      try {
        const document = createDiagramDocument({ source: defaultMermaidSource, ...options });
        await repository.put(document);
        savedRevisionsRef.current.set(document.id, document.revision);
        replaceDocumentInList(document);
        commitDraft(document);
        dirtyRef.current = false;
        setRendererActive(true);
        invalidateRenderedOutput();
        setLibraryOpen(false);
        return document;
      } catch (error) {
        showToast(errorMessage(error, en.editor.messages.createFailed), { tone: 'error' });
        return undefined;
      }
    },
    [commitDraft, flushAutosave, invalidateRenderedOutput, replaceDocumentInList, showToast],
  );

  const selectDocument = useCallback(
    async (id: string) => {
      if (id === draftRef.current?.id) {
        setLibraryOpen(false);
        return;
      }
      if (!(await flushAutosave())) return;
      const repository = repositoryRef.current;
      if (repository === undefined) return;
      try {
        const selected = await repository.get(id);
        if (selected === undefined) throw new Error(en.editor.messages.missingDocument);
        savedRevisionsRef.current.set(id, selected.revision);
        commitDraft(selected);
        dirtyRef.current = false;
        setRendererActive(true);
        invalidateRenderedOutput();
        setLibraryOpen(false);
      } catch (error) {
        showToast(errorMessage(error), { tone: 'error' });
      }
    },
    [commitDraft, flushAutosave, invalidateRenderedOutput, showToast],
  );

  const duplicateDocument = useCallback(
    (document: DiagramDocumentV1) => {
      void createDocument({
        title: titleWithSuffix(document.title, en.editor.shell.copySuffix),
        source: document.source,
        appearance: document.appearance,
        createdWithMermaid: document.createdWithMermaid,
      });
    },
    [createDocument],
  );

  const deleteDocument = useCallback(
    async (document: DiagramDocumentV1) => {
      if (document.id === draftRef.current?.id && !(await flushAutosave())) return;
      const manager = deleteUndoRef.current;
      const repository = repositoryRef.current;
      if (manager === undefined || repository === undefined) return;
      try {
        const deletion = await manager.delete(document.id);
        if (deletion === undefined) return;
        const remaining = await repository.list();
        setDocuments(remaining);
        if (document.id === draftRef.current?.id) {
          const next = remaining[0];
          if (next === undefined) await createDocument();
          else {
            commitDraft(next);
            dirtyRef.current = false;
            invalidateRenderedOutput();
          }
        }
        setUndoDeletions((current) => [...current, deletion]);
        showToast(en.editor.messages.deleted(deletion.title));
      } catch (error) {
        showToast(errorMessage(error, en.editor.messages.deleteFailed), { tone: 'error' });
      }
    },
    [commitDraft, createDocument, flushAutosave, invalidateRenderedOutput, showToast],
  );

  const undoDeletion = useCallback(
    async (deletion: UndoableDeletion) => {
      const manager = deleteUndoRef.current;
      const repository = repositoryRef.current;
      if (manager === undefined || repository === undefined) return;
      try {
        const restored = await manager.undo(deletion.token);
        if (!restored) return;
        setDocuments(await repository.list());
        setUndoDeletions((current) => current.filter(({ token }) => token !== deletion.token));
        showToast(en.editor.messages.restored(deletion.title));
      } catch (error) {
        showToast(errorMessage(error, en.editor.messages.restoreFailed), {
          tone: 'error',
        });
      }
    },
    [showToast],
  );

  const dismissDeletion = useCallback((deletion: UndoableDeletion) => {
    deleteUndoRef.current?.dismiss(deletion.token);
    setUndoDeletions((current) => current.filter(({ token }) => token !== deletion.token));
  }, []);

  const handleSourceChange = useCallback(
    (source: string) => {
      if (source.length > MAX_DOCUMENT_SOURCE_LENGTH) {
        showToast(en.editor.messages.sourceLimit(MAX_DOCUMENT_SOURCE_LENGTH), { tone: 'error' });
        return;
      }
      setRendererActive(true);
      mutateDraft({ source });
    },
    [mutateDraft, showToast],
  );

  const handleExternalPaste = useCallback(
    (source: string): SourceTransformation => {
      try {
        const normalized = normalizeMermaidSource(source);
        if (hasMultipleMermaidBlocks(normalized.report)) {
          showToast(en.editor.messages.pasteHasMultipleBlocks);
          return { kind: 'passthrough' };
        }
        const warnings = normalizationCount(normalized.report.warnings);
        if (normalized.report.changed) {
          return {
            kind: 'replace',
            source: normalized.source,
            announcement: cleanupSummary('paste', normalized.report),
          };
        }
        if (warnings > 0) showToast(en.editor.messages.pastedSourceNeedsReview(warnings));
        return { kind: 'passthrough' };
      } catch {
        showToast(en.editor.messages.pasteCleanupFailed, { tone: 'error' });
        return { kind: 'reject' };
      }
    },
    [showToast],
  );

  const handleNormalizeSource = useCallback(
    (source: string): SourceTransformation => {
      try {
        const normalized = normalizeMermaidSource(source);
        if (hasMultipleMermaidBlocks(normalized.report)) {
          showToast(en.editor.messages.sourceHasMultipleBlocks);
          return { kind: 'reject' };
        }
        if (!normalized.report.changed) {
          const warnings = normalizationCount(normalized.report.warnings);
          showToast(
            warnings === 0
              ? en.editor.messages.sourceAlreadyClean
              : en.editor.messages.sourceNeedsReview(warnings),
          );
          return { kind: 'reject' };
        }
        return {
          kind: 'replace',
          source: normalized.source,
          announcement: cleanupSummary('source', normalized.report),
        };
      } catch (error) {
        showToast(errorMessage(error, en.editor.messages.cleanupFailed), { tone: 'error' });
        return { kind: 'reject' };
      }
    },
    [showToast],
  );

  const handlePasteLimit = useCallback(() => {
    showToast(en.editor.messages.sourceLimit(MAX_DOCUMENT_SOURCE_LENGTH), { tone: 'error' });
  }, [showToast]);

  const handleTemplate = useCallback(
    (template: MermaidDiagramCatalogEntry) => {
      void createDocument({ source: template.source, title: template.label }).then((created) => {
        if (created !== undefined) setDialog(undefined);
      });
    },
    [createDocument],
  );

  const handleImport = useCallback(
    async (input: HTMLInputElement) => {
      const file = input.files?.[0];
      input.value = '';
      if (file === undefined) return;
      try {
        const imported = await importDiagramFile(file);
        const created = await createDocument({ title: imported.title, source: imported.source });
        if (created !== undefined) {
          const fixes = normalizationCount(imported.normalization.changes);
          const warnings = normalizationCount(imported.normalization.warnings);
          showToast(
            imported.normalization.changed
              ? en.editor.messages.importedAndCleaned(file.name, fixes, warnings)
              : warnings > 0
                ? en.editor.messages.importedWithReview(file.name, warnings)
                : en.editor.messages.imported(file.name),
          );
        }
      } catch (error) {
        showToast(errorMessage(error, en.editor.messages.importFailed), { tone: 'error' });
      }
    },
    [createDocument, showToast],
  );

  const downloadSource = useCallback(() => {
    const current = draftRef.current;
    if (current === undefined) return;
    try {
      const download = createSourceDownload(current);
      downloadBlob(download.blob, download.filename);
    } catch (error) {
      showToast(errorMessage(error, en.editor.messages.sourceExportFailed), { tone: 'error' });
    }
  }, [showToast]);

  const openShareDialog = useCallback(() => {
    const current = draftRef.current;
    if (current === undefined) return;
    try {
      const hash = encodeShareHash(documentToShareEnvelope(current));
      const url = new URL('/editor/', location.origin);
      url.hash = hash.slice(1);
      if (url.href.length > MAX_SHARE_URL_LENGTH) {
        throw new ShareCodecError('url_too_large', en.editor.messages.shareUrlTooLarge);
      }
      setShareUrl(url.href);
      setShareError(undefined);
    } catch (error) {
      setShareUrl(undefined);
      setShareError(errorMessage(error, en.editor.messages.shareTooLarge));
    }
    setDialog('share');
  }, []);

  const clearLocalData = useCallback(async () => {
    const repository = repositoryRef.current;
    if (repository === undefined) return;
    try {
      await autosaveRef.current?.cancelAndWait();
      deleteUndoRef.current?.dispose();
      await repository.clear();
      await clearLocalVitalsHistory();
      clearRecoveryJournal();
      setUndoDeletions([]);
      savedRevisionsRef.current.clear();
      setDocuments([]);
      setDialog(undefined);
      await createDocument({ title: en.editor.shell.welcomeDiagram, source: defaultMermaidSource });
      deleteUndoRef.current = new DeleteUndoManager(repository);
      showToast(en.editor.messages.dataCleared);
    } catch (error) {
      showToast(errorMessage(error, en.editor.messages.clearFailed), { tone: 'error' });
    }
  }, [createDocument, showToast]);

  const resolveConflictWithStored = useCallback(async () => {
    if (conflict === undefined) return;
    await autosaveRef.current?.cancelAndWait();
    clearRecoveryJournal();
    savedRevisionsRef.current.set(conflict.stored.id, conflict.stored.revision);
    commitDraft(conflict.stored);
    replaceDocumentInList(conflict.stored);
    dirtyRef.current = false;
    setConflict(undefined);
    invalidateRenderedOutput();
    showToast(en.editor.messages.loadedOtherTab);
  }, [commitDraft, conflict, invalidateRenderedOutput, replaceDocumentInList, showToast]);

  const resolveConflictWithCopy = useCallback(async () => {
    if (conflict === undefined) return;
    await autosaveRef.current?.cancelAndWait();
    const created = await createDocument({
      title: titleWithSuffix(conflict.local.title, en.editor.shell.conflictedCopySuffix),
      source: conflict.local.source,
      appearance: conflict.local.appearance,
      createdWithMermaid: conflict.local.createdWithMermaid,
    });
    if (created === undefined) return;
    clearRecoveryJournal();
    setConflict(undefined);
  }, [conflict, createDocument]);

  const handleSvgChange = useCallback((svg: SanitizedSvg | undefined, revision: number) => {
    if (revision === renderRevisionRef.current) setSanitizedSvg(svg);
  }, []);
  const handleRenderError = useCallback((error: Error | undefined, revision: number) => {
    if (revision !== renderRevisionRef.current) return;
    if (error !== undefined) setSanitizedSvg(undefined);
    setRenderError(error);
  }, []);

  const saveStatus =
    saveSnapshot.state === 'pending'
      ? { label: en.editor.unsaved, state: 'pending' }
      : saveSnapshot.state === 'saving'
        ? { label: en.editor.saving, state: 'saving' }
        : saveSnapshot.state === 'error'
          ? { label: en.editor.shell.saveFailed, state: 'error' }
          : {
              label: storageMode === 'volatile' ? en.editor.shell.temporary : en.editor.saved,
              state: 'saved',
            };

  if (!ready || draft === undefined) {
    return (
      <main class="editor-loading" aria-busy={!ready}>
        <div>
          <span class="editor-loading__mark" aria-hidden="true">
            {en.appMark}
          </span>
          <p>{ready ? en.editor.shell.loadingFailure : en.editor.shell.loading}</p>
        </div>
      </main>
    );
  }

  return (
    <div class="editor-app">
      <header class="app-header">
        <button
          ref={libraryButtonRef}
          class="icon-button icon-button--quiet mobile-library-button"
          type="button"
          onClick={() => setLibraryOpen(true)}
          aria-label={en.editor.shell.openLibrary}
          aria-controls="local-library"
          aria-expanded={libraryOpen}
        >
          <Icon name="menu" />
        </button>
        {hostBridge.capabilities.externalNavigation ? (
          <a class="app-brand" href="/" aria-label={en.editor.shell.homeLabel}>
            <span class="app-brand__mark" aria-hidden="true">
              {en.appMark}
            </span>
            <span class="app-brand__label">{en.appName}</span>
          </a>
        ) : (
          <span class="app-brand" aria-label={en.appName}>
            <span class="app-brand__mark" aria-hidden="true">
              {en.appMark}
            </span>
            <span class="app-brand__label">{en.appName}</span>
          </span>
        )}
        <div class="document-title-wrap">
          <label class="sr-only" htmlFor="document-title">
            {en.editor.shell.diagramTitle}
          </label>
          <input
            id="document-title"
            class="document-title"
            value={draft.title}
            maxLength={200}
            onInput={(event) =>
              mutateDraft({ title: event.currentTarget.value || en.editor.shell.untitledDiagram })
            }
          />
          {saveStatus.state === 'error' ? (
            <button
              class="save-state save-state--button"
              data-state="error"
              type="button"
              title={en.editor.shell.retrySavingTitle}
              onClick={() => {
                void autosaveRef.current?.retry().catch((error: unknown) => {
                  if (error instanceof RevisionConflictError && draftRef.current !== undefined) {
                    setConflict({ local: draftRef.current, stored: error.storedDocument });
                  }
                  showToast(errorMessage(error, en.editor.messages.retrySaveFailed), {
                    tone: 'error',
                  });
                });
              }}
            >
              <Icon name="warning" size={14} />
              <span>{en.editor.shell.retrySave}</span>
            </button>
          ) : (
            <span class="save-state" data-state={saveStatus.state} title={saveStatus.label}>
              {saveStatus.state === 'saved' ? <Icon name="check" size={14} /> : null}
              <span class="save-state__label">{saveStatus.label}</span>
            </span>
          )}
        </div>
        <nav class="toolbar" aria-label={en.editor.shell.actions}>
          <div class="toolbar-group toolbar-group--secondary">
            <button
              class="button"
              type="button"
              aria-label={en.editor.shell.chooseTemplate}
              onClick={() => setDialog('templates')}
            >
              <Icon name="template" size={16} />
              <span class="button__label">{en.editor.templates}</span>
            </button>
            {hostBridge.capabilities.fileUpload ? (
              <button
                class="button"
                type="button"
                aria-label={en.editor.shell.importSource}
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="import" size={16} />
                <span class="button__label">{en.editor.import}</span>
              </button>
            ) : null}
          </div>
          <div class="toolbar-group">
            <button
              class="icon-button icon-button--quiet"
              type="button"
              onClick={openShareDialog}
              aria-label={en.editor.shell.shareSnapshot}
              title={en.editor.shell.shareSnapshot}
            >
              <Icon name="share" />
            </button>
            <button
              class="button button--primary"
              type="button"
              aria-label={en.editor.shell.exportDiagram}
              onClick={() => setDialog('export')}
            >
              <Icon name="export" size={16} />
              <span class="button__label">{en.editor.export}</span>
            </button>
          </div>
          <details class="header-menu">
            <summary class="icon-button icon-button--quiet" aria-label={en.editor.shell.settings}>
              <Icon name="more" />
            </summary>
            <div class="header-menu__popover">
              <label>
                {en.editor.theme}
                <select
                  class="select-control"
                  value={draft.appearance.theme}
                  onChange={(event) =>
                    mutateDraft({
                      appearance: {
                        ...draft.appearance,
                        theme: event.currentTarget.value as DiagramTheme,
                      },
                    })
                  }
                >
                  <option value="default">{en.editor.shell.defaultTheme}</option>
                  <option value="neutral">{en.editor.shell.neutralTheme}</option>
                  <option value="dark">{en.editor.shell.darkTheme}</option>
                  <option value="forest">{en.editor.shell.forestTheme}</option>
                </select>
              </label>
              <label>
                {en.editor.shell.interfaceTheme}
                <select
                  class="select-control"
                  value={colorScheme}
                  onChange={(event) =>
                    setColorScheme(event.currentTarget.value as typeof colorScheme)
                  }
                >
                  <option value="system">{en.editor.shell.systemTheme}</option>
                  <option value="light">{en.editor.shell.lightTheme}</option>
                  <option value="dark">{en.editor.shell.darkTheme}</option>
                </select>
              </label>
              {hostBridge.capabilities.externalNavigation ? (
                <>
                  <a href="/guides/">{en.editor.shell.guides}</a>
                  <a href="/privacy/">{en.editor.shell.privacy}</a>
                </>
              ) : null}
            </div>
          </details>
        </nav>
        <input
          ref={fileInputRef}
          class="sr-only"
          type="file"
          tabIndex={-1}
          aria-label={en.editor.shell.importFile}
          accept=".mmd,.mermaid,.txt,.md,text/plain,text/markdown"
          onChange={(event) => void handleImport(event.currentTarget)}
        />
      </header>

      <main class="app-main">
        <DocumentLibrary
          documents={filteredDocuments}
          activeId={draft.id}
          query={query}
          open={libraryOpen}
          onQueryChange={setQuery}
          onSelect={(id) => void selectDocument(id)}
          onCreate={() => void createDocument()}
          onDuplicate={duplicateDocument}
          onDelete={(document) => void deleteDocument(document)}
          onClose={() => setLibraryOpen(false)}
          onClearData={() => setDialog('clear')}
        />
        <div class="editor-workspace">
          <div class="mobile-tabs" role="tablist" aria-label={en.editor.shell.editorView}>
            <button
              id="source-tab"
              class="mobile-tab"
              type="button"
              role="tab"
              aria-controls="source-panel"
              aria-selected={mobilePane === 'source'}
              tabIndex={mobilePane === 'source' ? 0 : -1}
              onClick={() => setMobilePane('source')}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const nextPane =
                  event.key === 'ArrowLeft' || event.key === 'Home' ? 'source' : 'preview';
                setMobilePane(nextPane);
                if (nextPane === 'preview') setRendererActive(true);
                requestAnimationFrame(() => document.getElementById(`${nextPane}-tab`)?.focus());
              }}
            >
              {en.editor.source}
            </button>
            <button
              id="preview-tab"
              class="mobile-tab"
              type="button"
              role="tab"
              aria-controls="preview-panel"
              aria-selected={mobilePane === 'preview'}
              tabIndex={mobilePane === 'preview' ? 0 : -1}
              onClick={() => {
                setRendererActive(true);
                invalidateRenderedOutput();
                setMobilePane('preview');
              }}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const nextPane =
                  event.key === 'ArrowRight' || event.key === 'End' ? 'preview' : 'source';
                setMobilePane(nextPane);
                if (nextPane === 'preview') setRendererActive(true);
                requestAnimationFrame(() => document.getElementById(`${nextPane}-tab`)?.focus());
              }}
            >
              {en.editor.preview}
            </button>
          </div>
          <div
            ref={splitRef}
            class="split-workspace"
            style={{ '--source-width': `${String(sourcePercent)}%` }}
          >
            <SourcePane
              documentId={draft.id}
              source={draft.source}
              diagnostic={diagnosticFromError(renderError)}
              mobileHidden={mobilePane !== 'source'}
              canImport={hostBridge.capabilities.fileUpload}
              onChange={handleSourceChange}
              onExternalPaste={handleExternalPaste}
              onNormalizeSource={handleNormalizeSource}
              onPasteLimit={handlePasteLimit}
              onTransformationApplied={showToast}
              onCopy={() =>
                void copyText(draft.source)
                  .then(() => showToast(en.editor.messages.sourceCopied))
                  .catch((error: unknown) => showToast(errorMessage(error), { tone: 'error' }))
              }
              onImport={() => fileInputRef.current?.click()}
            />
            <div
              class="pane-resizer"
              {...separatorProps}
              data-dragging={dragging ? 'true' : 'false'}
            />
            <PreviewPane
              active={rendererActive}
              source={draft.source}
              revision={renderRevision}
              theme={draft.appearance.theme}
              mobileHidden={mobilePane !== 'preview'}
              canFullscreen={hostBridge.capabilities.fullscreen}
              onSvgChange={handleSvgChange}
              onError={handleRenderError}
              onActivate={() => setRendererActive(true)}
            />
          </div>
        </div>
      </main>

      <TemplateDialog
        open={dialog === 'templates'}
        onClose={() => setDialog(undefined)}
        onSelect={handleTemplate}
      />
      <ShareDialog
        open={dialog === 'share'}
        shareUrl={shareUrl}
        error={shareError}
        onClose={() => setDialog(undefined)}
        onCopy={() => {
          if (shareUrl === undefined) return;
          void copyText(shareUrl)
            .then(() => showToast(en.editor.messages.shareLinkCopied))
            .catch((error: unknown) => showToast(errorMessage(error), { tone: 'error' }));
        }}
        onDownloadSource={downloadSource}
      />
      <ExportDialog
        open={dialog === 'export'}
        svgReady={sanitizedSvg !== undefined}
        pngScale={pngScale}
        background={draft.appearance.background}
        busy={exportBusy}
        onClose={() => setDialog(undefined)}
        onScaleChange={setPngScale}
        onBackgroundChange={(background: DiagramBackground) =>
          mutateDraft({ appearance: { ...draft.appearance, background } })
        }
        onDownloadSource={downloadSource}
        onDownloadSvg={() => {
          if (sanitizedSvg === undefined) return;
          try {
            downloadSanitizedSvg(sanitizedSvg, draft.title);
            showToast(en.editor.messages.svgDownloadStarted);
          } catch (error) {
            showToast(errorMessage(error), { tone: 'error' });
          }
        }}
        onCopySvg={() => {
          if (sanitizedSvg === undefined) return;
          void copySanitizedSvg(sanitizedSvg)
            .then(() => showToast(en.editor.messages.svgCopied))
            .catch((error: unknown) => showToast(errorMessage(error), { tone: 'error' }));
        }}
        onDownloadPng={() => {
          if (sanitizedSvg === undefined) return;
          setExportBusy(true);
          void downloadPng(sanitizedSvg, draft.title, {
            scale: pngScale,
            background: draft.appearance.background,
          })
            .then(() => showToast(en.editor.messages.pngDownloadStarted))
            .catch((error: unknown) => showToast(errorMessage(error), { tone: 'error' }))
            .finally(() => setExportBusy(false));
        }}
      />
      <Modal
        title={en.editor.clearDialog.title}
        open={dialog === 'clear'}
        onClose={() => setDialog(undefined)}
        footer={
          <>
            <button class="button" type="button" onClick={() => setDialog(undefined)}>
              {en.editor.cancel}
            </button>
            <button
              class="button button--danger"
              type="button"
              onClick={() => void clearLocalData()}
            >
              {en.editor.clearData}
            </button>
          </>
        }
      >
        <p class="dialog-copy">{en.editor.clearDialog.description}</p>
      </Modal>
      <Modal
        title={en.editor.conflictDialog.title}
        open={conflict !== undefined}
        onClose={() => undefined}
        dismissible={false}
        footer={
          <>
            <button class="button" type="button" onClick={() => void resolveConflictWithStored()}>
              {en.editor.conflictDialog.loadSaved}
            </button>
            <button
              class="button button--primary"
              type="button"
              onClick={() => void resolveConflictWithCopy()}
            >
              {en.editor.conflictDialog.keepCopy}
            </button>
          </>
        }
      >
        <p class="dialog-copy">{en.editor.conflictDialog.description}</p>
      </Modal>

      <div class="toast-region" aria-live="polite" aria-atomic="true">
        {undoDeletions.map((deletion) => (
          <div class="toast" data-tone="default" key={deletion.token}>
            <span>{en.editor.messages.deletedBrief(deletion.title)}</span>
            <button
              class="button button--quiet"
              type="button"
              onClick={() => void undoDeletion(deletion)}
            >
              {en.editor.undoDelete}
            </button>
            <button
              class="icon-button icon-button--quiet"
              type="button"
              onClick={() => dismissDeletion(deletion)}
              aria-label={en.editor.messages.dismissUndoFor(deletion.title)}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
        {toast === undefined ? null : (
          <div class="toast" data-tone={toast.tone ?? 'default'}>
            <span>{toast.message}</span>
            <button
              class="icon-button icon-button--quiet"
              type="button"
              onClick={() => setToast(undefined)}
              aria-label={en.editor.shell.dismissNotification}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
      </div>
      <div class="ad-slot ad-slot--editor-rail" data-enabled="false" aria-hidden="true" />
    </div>
  );
}
