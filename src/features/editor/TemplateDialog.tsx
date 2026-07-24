import { useMemo, useState } from 'preact/hooks';

import {
  mermaidDiagramCatalog,
  type MermaidDiagramCatalogEntry,
} from '@lib/mermaid-language/catalog';

import { en } from '../../i18n/en';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface TemplateDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSelect: (template: MermaidDiagramCatalogEntry) => void;
}

export function TemplateDialog({ open, onClose, onSelect }: TemplateDialogProps) {
  const [query, setQuery] = useState('');

  const templates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length === 0) return mermaidDiagramCatalog;
    return mermaidDiagramCatalog.filter((template) =>
      `${template.label} ${template.description} ${template.directive}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [query]);

  return (
    <Modal title={en.editor.templateDialog.title} open={open} onClose={onClose} wide>
      <p class="dialog-copy">{en.editor.templateDialog.description}</p>
      <label class="search-field template-search">
        <span class="sr-only">{en.editor.templateDialog.search}</span>
        <Icon name="search" />
        <input
          class="text-input"
          type="search"
          value={query}
          placeholder={en.editor.templateDialog.search}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      {templates.length === 0 ? (
        <p class="library-empty">{en.editor.templateDialog.noMatches}</p>
      ) : (
        <div class="template-grid">
          {templates.map((template) => (
            <button class="template-card" type="button" onClick={() => onSelect(template)}>
              <span class="template-card__topline">
                <span class="template-card__title">{template.label}</span>
                {template.stability !== 'stable' ? (
                  <span class="template-card__badge">{template.stability}</span>
                ) : null}
              </span>
              <span class="template-card__description">{template.description}</span>
              <code>{template.directive}</code>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
