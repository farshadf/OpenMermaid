import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { en } from '../../i18n/en';

const MIN_PANE_PIXELS = 256;

export interface PaneResizeController {
  readonly sourcePercent: number;
  readonly dragging: boolean;
  readonly separatorProps: {
    readonly role: 'separator';
    readonly tabIndex: 0;
    readonly 'aria-label': string;
    readonly 'aria-orientation': 'vertical';
    readonly 'aria-valuemin': number;
    readonly 'aria-valuemax': number;
    readonly 'aria-valuenow': number;
    readonly onPointerDown: (event: PointerEvent) => void;
    readonly onKeyDown: (event: KeyboardEvent) => void;
  };
}

export function usePaneResize(containerRef: preact.RefObject<HTMLElement>): PaneResizeController {
  const [sourcePercent, setSourcePercent] = useState(50);
  const [dragging, setDragging] = useState(false);
  const activePointer = useRef<number>();

  const clampPercent = useCallback(
    (percent: number) => {
      const width = containerRef.current?.getBoundingClientRect().width ?? 0;
      if (width <= MIN_PANE_PIXELS * 2) return 50;
      const minimum = (MIN_PANE_PIXELS / width) * 100;
      return Math.min(100 - minimum, Math.max(minimum, percent));
    },
    [containerRef],
  );

  const moveFromClientX = useCallback(
    (clientX: number) => {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (bounds === undefined || bounds.width === 0) return;
      const logicalX = document.dir === 'rtl' ? bounds.right - clientX : clientX - bounds.left;
      setSourcePercent(clampPercent((logicalX / bounds.width) * 100));
    },
    [clampPercent, containerRef],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (activePointer.current !== event.pointerId) return;
      moveFromClientX(event.clientX);
    };
    const handlePointerEnd = (event: PointerEvent) => {
      if (activePointer.current !== event.pointerId) return;
      activePointer.current = undefined;
      setDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [moveFromClientX]);

  const onPointerDown = (event: PointerEvent) => {
    activePointer.current = event.pointerId;
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDragging(true);
    moveFromClientX(event.clientX);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const direction = document.dir === 'rtl' ? -1 : 1;
    let next: number | undefined;
    switch (event.key) {
      case 'ArrowLeft':
        next = sourcePercent - 2 * direction;
        break;
      case 'ArrowRight':
        next = sourcePercent + 2 * direction;
        break;
      case 'Home':
        next = 25;
        break;
      case 'End':
        next = 75;
        break;
      default:
        return;
    }
    event.preventDefault();
    setSourcePercent(clampPercent(next));
  };

  return {
    sourcePercent,
    dragging,
    separatorProps: {
      role: 'separator',
      tabIndex: 0,
      'aria-label': en.editor.shell.resizePanes,
      'aria-orientation': 'vertical',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': Math.round(sourcePercent),
      onPointerDown,
      onKeyDown,
    },
  };
}
