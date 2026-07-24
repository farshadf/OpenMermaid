import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';

import { en } from '../../i18n/en';
import { Icon } from './Icon';

interface ModalProps {
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ComponentChildren;
  readonly footer?: ComponentChildren;
  readonly wide?: boolean;
  readonly dismissible?: boolean;
}

export function Modal({
  title,
  open,
  onClose,
  children,
  footer,
  wide = false,
  dismissible = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      class={`dialog${wide ? ' dialog--wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClose={onClose}
    >
      <div class="dialog-header">
        <h2 class="dialog-title" id={titleId}>
          {title}
        </h2>
        {dismissible ? (
          <button
            class="icon-button icon-button--quiet"
            type="button"
            onClick={onClose}
            aria-label={en.editor.modal.close}
          >
            <Icon name="close" />
          </button>
        ) : null}
      </div>
      <div class="dialog-body">{children}</div>
      {footer === undefined ? null : <div class="dialog-footer">{footer}</div>}
    </dialog>
  );
}
