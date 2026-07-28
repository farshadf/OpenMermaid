export interface ViewportState {
  scale: number;
  x: number;
  y: number;
}

export interface PreviewViewportOptions {
  surface: HTMLElement;
  scene: HTMLElement;
  onChange?: (state: ViewportState) => void;
}

interface Point {
  x: number;
  y: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const FIT_PADDING = 32;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function parseViewBox(svg: SVGSVGElement): { width: number; height: number } | undefined {
  const parts = svg
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (
    parts?.length === 4 &&
    parts.every(Number.isFinite) &&
    parts[2] !== undefined &&
    parts[3] !== undefined &&
    parts[2] > 0 &&
    parts[3] > 0
  ) {
    return { width: parts[2], height: parts[3] };
  }
  const width = Number.parseFloat(svg.getAttribute('width') ?? '');
  const height = Number.parseFloat(svg.getAttribute('height') ?? '');
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width, height };
  }
  return undefined;
}

function renderedDimensions(
  svg: SVGSVGElement,
  currentScale: number,
): { width: number; height: number } | undefined {
  const bounds = svg.getBoundingClientRect();
  if (
    Number.isFinite(bounds.width) &&
    bounds.width > 0 &&
    Number.isFinite(bounds.height) &&
    bounds.height > 0 &&
    Number.isFinite(currentScale) &&
    currentScale > 0
  ) {
    return {
      width: bounds.width / currentScale,
      height: bounds.height / currentScale,
    };
  }
  return parseViewBox(svg);
}

export class PreviewViewport {
  private readonly surface: HTMLElement;
  private readonly scene: HTMLElement;
  private readonly onChange: ((state: ViewportState) => void) | undefined;
  private readonly resizeObserver: ResizeObserver | undefined;
  private stateValue: ViewportState = { scale: 1, x: 0, y: 0 };
  private autoFit = true;
  private readonly pointers = new Map<number, Point>();
  private gestureStart:
    | {
        state: ViewportState;
        points: Point[];
      }
    | undefined;

  constructor(options: PreviewViewportOptions) {
    this.surface = options.surface;
    this.scene = options.scene;
    this.onChange = options.onChange;
    this.surface.addEventListener('pointerdown', this.handlePointerDown);
    this.surface.addEventListener('pointermove', this.handlePointerMove);
    this.surface.addEventListener('pointerup', this.handlePointerEnd);
    this.surface.addEventListener('pointercancel', this.handlePointerEnd);
    this.surface.addEventListener('wheel', this.handleWheel, { passive: false });
    this.surface.addEventListener('keydown', this.handleKeydown);
    this.resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            if (this.autoFit) {
              this.fitToBounds();
            }
          });
    this.resizeObserver?.observe(this.surface);
    this.apply();
  }

  get state(): ViewportState {
    return { ...this.stateValue };
  }

  set(state: ViewportState): ViewportState {
    this.autoFit = false;
    return this.setState(state);
  }

  contentChanged(): ViewportState {
    return this.autoFit ? this.fitToBounds() : this.state;
  }

  private setState(state: ViewportState): ViewportState {
    this.stateValue = {
      scale: clamp(state.scale, MIN_SCALE, MAX_SCALE),
      x: Number.isFinite(state.x) ? state.x : 0,
      y: Number.isFinite(state.y) ? state.y : 0,
    };
    this.apply();
    return this.state;
  }

  panBy(x: number, y: number): ViewportState {
    return this.set({
      ...this.stateValue,
      x: this.stateValue.x + x,
      y: this.stateValue.y + y,
    });
  }

  zoomBy(factor: number, origin?: Point): ViewportState {
    if (!Number.isFinite(factor) || factor <= 0) {
      return this.state;
    }
    const surfaceBounds = this.surface.getBoundingClientRect();
    const target = origin ?? {
      x: surfaceBounds.width / 2,
      y: surfaceBounds.height / 2,
    };
    const nextScale = clamp(this.stateValue.scale * factor, MIN_SCALE, MAX_SCALE);
    const contentX = (target.x - this.stateValue.x) / this.stateValue.scale;
    const contentY = (target.y - this.stateValue.y) / this.stateValue.scale;
    return this.set({
      scale: nextScale,
      x: target.x - contentX * nextScale,
      y: target.y - contentY * nextScale,
    });
  }

  fit(): ViewportState {
    this.autoFit = true;
    return this.fitToBounds();
  }

  private fitToBounds(): ViewportState {
    const svg = this.scene.querySelector('svg');
    // Mermaid commonly emits width="100%" alongside a large viewBox. The SVG's
    // actual CSS box can therefore be much smaller than its viewBox. Fit the box
    // users can see, removing our current scene scale from the measured bounds.
    const dimensions = svg ? renderedDimensions(svg, this.stateValue.scale) : undefined;
    const bounds = this.surface.getBoundingClientRect();
    if (!dimensions || bounds.width <= 0 || bounds.height <= 0) {
      return this.setState({ scale: 1, x: 0, y: 0 });
    }

    const availableWidth = Math.max(1, bounds.width - FIT_PADDING * 2);
    const availableHeight = Math.max(1, bounds.height - FIT_PADDING * 2);
    const scale = clamp(
      Math.min(availableWidth / dimensions.width, availableHeight / dimensions.height),
      MIN_SCALE,
      MAX_SCALE,
    );
    return this.setState({
      scale,
      x: (bounds.width - dimensions.width * scale) / 2,
      y: (bounds.height - dimensions.height * scale) / 2,
    });
  }

  reset(): ViewportState {
    return this.set({ scale: 1, x: 0, y: 0 });
  }

  destroy(): void {
    this.surface.removeEventListener('pointerdown', this.handlePointerDown);
    this.surface.removeEventListener('pointermove', this.handlePointerMove);
    this.surface.removeEventListener('pointerup', this.handlePointerEnd);
    this.surface.removeEventListener('pointercancel', this.handlePointerEnd);
    this.surface.removeEventListener('wheel', this.handleWheel);
    this.surface.removeEventListener('keydown', this.handleKeydown);
    this.resizeObserver?.disconnect();
  }

  private apply(): void {
    const { scale, x, y } = this.stateValue;
    this.scene.style.transform = `translate3d(${String(x)}px, ${String(y)}px, 0) scale(${String(scale)})`;
    this.surface.style.cursor = this.pointers.size > 0 ? 'grabbing' : 'grab';
    this.onChange?.(this.state);
  }

  private restartGesture(): void {
    this.gestureStart = {
      state: this.state,
      points: [...this.pointers.values()].slice(0, 2),
    };
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    this.surface.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.restartGesture();
    this.apply();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId) || !this.gestureStart) {
      return;
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = [...this.pointers.values()].slice(0, 2);
    const initial = this.gestureStart.points;

    if (current.length === 1 && initial[0] && current[0]) {
      this.set({
        ...this.gestureStart.state,
        x: this.gestureStart.state.x + current[0].x - initial[0].x,
        y: this.gestureStart.state.y + current[0].y - initial[0].y,
      });
      return;
    }

    if (current.length === 2 && initial[0] && initial[1] && current[0] && current[1]) {
      const startDistance = distance(initial[0], initial[1]);
      if (startDistance === 0) {
        return;
      }
      const startMiddle = midpoint(initial[0], initial[1]);
      const currentMiddle = midpoint(current[0], current[1]);
      const nextScale = clamp(
        this.gestureStart.state.scale * (distance(current[0], current[1]) / startDistance),
        MIN_SCALE,
        MAX_SCALE,
      );
      const contentX = (startMiddle.x - this.gestureStart.state.x) / this.gestureStart.state.scale;
      const contentY = (startMiddle.y - this.gestureStart.state.y) / this.gestureStart.state.scale;
      this.set({
        scale: nextScale,
        x: currentMiddle.x - contentX * nextScale,
        y: currentMiddle.y - contentY * nextScale,
      });
    }
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size > 0) {
      this.restartGesture();
    } else {
      this.gestureStart = undefined;
    }
    this.apply();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const bounds = this.surface.getBoundingClientRect();
    if (event.ctrlKey || event.metaKey) {
      this.zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
    } else {
      this.panBy(-event.deltaX, -event.deltaY);
    }
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      this.zoomBy(1.2);
    } else if (event.key === '-') {
      event.preventDefault();
      this.zoomBy(1 / 1.2);
    } else if (event.key === '0') {
      event.preventDefault();
      this.reset();
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.fit();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.panBy(24, 0);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.panBy(-24, 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.panBy(0, 24);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.panBy(0, -24);
    }
  };
}
