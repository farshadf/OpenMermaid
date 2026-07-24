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

function createViewport(bounds: MutableBounds, viewBox = '0 0 400 200') {
  const surface = document.createElement('div');
  const scene = document.createElement('div');
  scene.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"></svg>`;
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
