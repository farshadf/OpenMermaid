import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewViewport } from '../../../src/lib/rendering/viewport';

interface MutableBounds {
  width: number;
  height: number;
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  trigger(): void {
    this.callback([], this);
  }
}

function createViewport(
  bounds: MutableBounds,
  viewBox = '0 0 400 200',
  renderedSize?: { width: number; height: number },
) {
  const surface = document.createElement('div');
  const scene = document.createElement('div');
  scene.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"></svg>`;
  const svg = scene.querySelector('svg');
  if (svg && renderedSize) {
    vi.spyOn(svg, 'getBoundingClientRect').mockImplementation(() => {
      const scale = Number(/scale\(([^)]+)\)/u.exec(scene.style.transform)?.[1] ?? 1);
      const width = renderedSize.width * scale;
      const height = renderedSize.height * scale;
      return {
        bottom: height,
        height,
        left: 0,
        right: width,
        top: 0,
        width,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      };
    });
  }
  surface.append(scene);
  document.body.append(surface);

  vi.spyOn(surface, 'getBoundingClientRect').mockImplementation(() => ({
    bottom: bounds.height,
    height: bounds.height,
    left: 0,
    right: bounds.width,
    top: 0,
    width: bounds.width,
    x: 0,
    y: 0,
    toJSON: () => undefined,
  }));

  const onChange = vi.fn();
  return {
    onChange,
    scene,
    surface,
    viewport: new PreviewViewport({ surface, scene, onChange }),
  };
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('PreviewViewport automatic fit', () => {
  it('fits the rendered SVG box when percentage sizing differs from its viewBox', () => {
    const bounds = { width: 656, height: 866 };
    const { viewport } = createViewport(bounds, '0 0 2033.1796875 63', {
      width: 299.515625,
      height: 9.265625,
    });

    const fitted = viewport.contentChanged();
    expect(fitted.scale).toBeCloseTo(1.976525, 5);
    expect(fitted.x).toBeCloseTo(32, 5);
    expect(fitted.y).toBeCloseTo(423.843132, 5);
    viewport.zoomBy(1.5);
    viewport.panBy(80, -40);
    const refitted = viewport.fit();
    expect(refitted.scale).toBeCloseTo(1.976525, 5);
    expect(refitted.x).toBeCloseTo(32, 5);
    expect(refitted.y).toBeCloseTo(423.843132, 5);
  });

  it('fits a rendered SVG that has no usable intrinsic dimensions', () => {
    const bounds = { width: 800, height: 600 };
    const { viewport } = createViewport(bounds, '', { width: 300, height: 150 });

    const fitted = viewport.contentChanged();
    expect(fitted.scale).toBeCloseTo(2.453333, 5);
    expect(fitted.x).toBeCloseTo(32, 5);
    expect(fitted.y).toBeCloseTo(116, 5);
  });

  it('uses the available surface and refits when the preview is resized', () => {
    const bounds = { width: 800, height: 600 };
    const { viewport } = createViewport(bounds);

    expect(viewport.contentChanged()).toEqual({
      scale: 1.84,
      x: 32,
      y: 116,
    });

    bounds.width = 1_000;
    MockResizeObserver.instances[0]?.trigger();

    expect(viewport.state).toEqual({
      scale: 2.34,
      x: 32,
      y: 66,
    });

    viewport.destroy();
    expect(MockResizeObserver.instances[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it('preserves a manually adjusted view until fit is explicitly selected again', () => {
    const bounds = { width: 800, height: 600 };
    const { scene, viewport } = createViewport(bounds);
    viewport.contentChanged();
    viewport.panBy(10, 20);

    bounds.width = 1_000;
    scene.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"></svg>';
    MockResizeObserver.instances[0]?.trigger();
    viewport.contentChanged();

    expect(viewport.state).toEqual({
      scale: 1.84,
      x: 42,
      y: 136,
    });

    expect(viewport.fit()).toEqual({
      scale: 2.68,
      x: 232,
      y: 32,
    });

    bounds.width = 800;
    MockResizeObserver.instances[0]?.trigger();
    expect(viewport.state).toEqual({
      scale: 2.68,
      x: 132,
      y: 32,
    });
  });
});
