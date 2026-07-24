import { en } from '../../i18n/en';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface ShareDialogProps {
  readonly open: boolean;
  readonly shareUrl?: string | undefined;
  readonly error?: string | undefined;
  readonly onClose: () => void;
  readonly onCopy: () => void;
  readonly onDownloadSource: () => void;
}

export function ShareDialog({
  open,
  shareUrl,
  error,
  onClose,
  onCopy,
  onDownloadSource,
}: ShareDialogProps) {
  return (
    <Modal title={en.editor.shareDialog.title} open={open} onClose={onClose}>
      <p class="dialog-copy">{en.editor.shareDialog.description}</p>
      {shareUrl === undefined ? (
        <div class="share-warning" role="alert">
          <Icon name="warning" size={18} />
          <span>{error ?? en.editor.shareDialog.unavailable}</span>
        </div>
      ) : (
        <div class="share-output">
          <label>
            <span class="sr-only">{en.editor.shareDialog.urlLabel}</span>
            <input
              class="text-input"
              readOnly
              value={shareUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button class="button button--primary" type="button" onClick={onCopy}>
            <Icon name="copy" size={16} /> {en.editor.shareDialog.copyLink}
          </button>
        </div>
      )}
      <div class="share-warning">
        <Icon name="warning" size={18} />
        <span>{en.editor.shareDialog.privacyWarning}</span>
      </div>
      {shareUrl === undefined ? (
        <p>
          <button class="button" type="button" onClick={onDownloadSource}>
            <Icon name="download" size={16} /> {en.editor.shareDialog.exportInstead}
          </button>
        </p>
      ) : null}
    </Modal>
  );
}
