import { useEffect, useRef, useState } from 'preact/hooks';

import type { DiagramDocumentV1 } from '@lib/documents';

import { en } from '../../i18n/en';
import { Icon } from './Icon';

interface DocumentLibraryProps {
  readonly documents: readonly DiagramDocumentV1[];
  readonly activeId?: string;
  readonly query: string;
  readonly open: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (id: string) => void;
  readonly onCreate: () => void;
  readonly onDuplicate: (document: DiagramDocumentV1) => void;
  readonly onDelete: (document: DiagramDocumentV1) => void;
  readonly onClose: () => void;
  readonly onClearData: () => void;
}

const modifiedDateFormatter = new Intl.DateTimeFormat(en.locale, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatModifiedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return en.editor.libraryPanel.modifiedRecently;
  return en.editor.libraryPanel.modified(modifiedDateFormatter.format(date));
}

export function DocumentLibrary({
  documents,
  activeId,
  query,
  open,
  onQueryChange,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
  onClose,
  onClearData,
}: DocumentLibraryProps) {
  const [isDrawer, setIsDrawer] = useState(false);
  const paneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 62rem)');
    const update = () => setIsDrawer(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const drawerHidden = isDrawer && !open;

  useEffect(() => {
    if (!isDrawer || !open) return;
    const frame = requestAnimationFrame(() => {
      paneRef.current?.querySelector<HTMLElement>('button, input, summary, a[href]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isDrawer, open]);

  return (
    <>
      {open ? (
        <button
          class="library-scrim"
          type="button"
          onClick={onClose}
          aria-label={en.editor.libraryPanel.closeLocal}
        />
      ) : null}
      <aside
        ref={paneRef}
        id="local-library"
        class="library-pane"
        data-open={open ? 'true' : 'false'}
        aria-hidden={drawerHidden ? 'true' : undefined}
        inert={drawerHidden}
        aria-label={en.editor.library}
      >
        <div class="library-header">
          <h2 class="library-heading">{en.editor.documents}</h2>
          <span class="toolbar-group">
            <button
              class="icon-button icon-button--quiet"
              type="button"
              onClick={onCreate}
              aria-label={en.editor.create}
              title={en.editor.create}
            >
              <Icon name="add" />
            </button>
            <button
              class="icon-button icon-button--quiet library-close"
              type="button"
              onClick={onClose}
              aria-label={en.editor.libraryPanel.close}
            >
              <Icon name="close" />
            </button>
          </span>
        </div>

        <label class="search-field">
          <span class="sr-only">{en.editor.searchDocuments}</span>
          <Icon name="search" size={16} />
          <input
            class="text-input"
            type="search"
            value={query}
            placeholder={en.editor.libraryPanel.searchPlaceholder}
            onInput={(event) => onQueryChange(event.currentTarget.value)}
          />
        </label>

        {documents.length === 0 ? (
          <p class="library-empty">
            {query.length > 0 ? en.editor.libraryPanel.noMatches : en.editor.libraryPanel.empty}
          </p>
        ) : (
          <ul class="document-list">
            {documents.map((document) => (
              <li
                key={document.id}
                class="library-item"
                aria-current={document.id === activeId ? 'true' : undefined}
              >
                <button
                  class="library-item__button"
                  type="button"
                  onClick={() => onSelect(document.id)}
                >
                  <span class="library-item__title">{document.title}</span>
                  <span class="library-item__date">{formatModifiedDate(document.updatedAt)}</span>
                </button>
                <details class="item-menu">
                  <summary
                    class="icon-button icon-button--quiet"
                    aria-label={en.editor.libraryPanel.actionsFor(document.title)}
                  >
                    <Icon name="more" />
                  </summary>
                  <div class="item-menu__popover">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open');
                        onDuplicate(document);
                      }}
                    >
                      <Icon name="duplicate" size={16} /> {en.editor.duplicate}
                    </button>
                    <button
                      class="danger"
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open');
                        onDelete(document);
                      }}
                    >
                      <Icon name="delete" size={16} /> {en.editor.delete}
                    </button>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}

        <div class="library-footer">
          <div class="local-badge">{en.editor.localOnly}</div>
          <button class="button button--quiet button--danger" type="button" onClick={onClearData}>
            {en.editor.clearData}
          </button>
        </div>
      </aside>
    </>
  );
}
