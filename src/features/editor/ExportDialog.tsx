import type { DiagramBackground } from '@lib/documents';
import type { PngScale } from '@lib/rendering';

import { en } from '../../i18n/en';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface ExportDialogProps {
  readonly open: boolean;
  readonly svgReady: boolean;
  readonly pngScale: PngScale;
  readonly background: DiagramBackground;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onScaleChange: (scale: PngScale) => void;
  readonly onBackgroundChange: (background: DiagramBackground) => void;
  readonly onDownloadSource: () => void;
  readonly onDownloadSvg: () => void;
  readonly onCopySvg: () => void;
  readonly onDownloadPng: () => void;
}

export function ExportDialog({
  open,
  svgReady,
  pngScale,
  background,
  busy,
  onClose,
  onScaleChange,
  onBackgroundChange,
  onDownloadSource,
  onDownloadSvg,
  onCopySvg,
  onDownloadPng,
}: ExportDialogProps) {
  return (
    <Modal title={en.editor.exportDialog.title} open={open} onClose={onClose}>
      <p class="dialog-copy">{en.editor.exportDialog.description}</p>
      <div class="export-grid">
        <button class="export-option" type="button" onClick={onDownloadSource}>
          <Icon name="download" size={24} />
          <strong>{en.editor.exportDialog.mermaidSource}</strong>
          <small>.mmd</small>
        </button>
        <button
          class="export-option"
          type="button"
          onClick={onDownloadSvg}
          disabled={!svgReady || busy}
        >
          <Icon name="download" size={24} />
          <strong>{en.editor.exportDialog.sanitizedSvg}</strong>
          <small>.svg</small>
        </button>
        <button
          class="export-option"
          type="button"
          onClick={onCopySvg}
          disabled={!svgReady || busy}
        >
          <Icon name="copy" size={24} />
          <strong>{en.editor.copySvg}</strong>
          <small>{en.editor.exportDialog.clipboard}</small>
        </button>
      </div>
      <hr />
      <div class="export-settings">
        <label class="dialog-field">
          {en.editor.exportDialog.pngScale}
          <select
            class="select-control"
            value={pngScale}
            onChange={(event) => onScaleChange(Number(event.currentTarget.value) as PngScale)}
          >
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={3}>3×</option>
          </select>
        </label>
        <label class="dialog-field">
          {en.editor.exportDialog.pngBackground}
          <select
            class="select-control"
            value={background}
            onChange={(event) => onBackgroundChange(event.currentTarget.value as DiagramBackground)}
          >
            <option value="transparent">{en.editor.exportDialog.transparent}</option>
            <option value="light">{en.editor.exportDialog.light}</option>
            <option value="dark">{en.editor.exportDialog.dark}</option>
          </select>
        </label>
      </div>
      <button
        class="button button--primary"
        type="button"
        disabled={!svgReady || busy}
        onClick={onDownloadPng}
      >
        <Icon name="download" size={16} />{' '}
        {busy
          ? en.editor.exportDialog.preparingPng
          : en.editor.exportDialog.downloadPngAtScale(pngScale)}
      </button>
    </Modal>
  );
}
