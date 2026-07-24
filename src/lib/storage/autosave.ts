import { validateDiagramDocument, type DiagramDocumentV1 } from '../documents';

export type AutosaveState = 'idle' | 'pending' | 'saving' | 'error';

export interface AutosaveSnapshot {
  state: AutosaveState;
  error?: unknown;
}

export interface AutosaveCoordinatorOptions {
  save: (document: DiagramDocumentV1) => Promise<void>;
  delayMs?: number;
  onStateChange?: (snapshot: AutosaveSnapshot) => void;
}

export class AutosaveCoordinator {
  readonly #save: AutosaveCoordinatorOptions['save'];
  readonly #delayMs: number;
  readonly #onStateChange: AutosaveCoordinatorOptions['onStateChange'];
  #state: AutosaveState = 'idle';
  #pending: DiagramDocumentV1 | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #inFlight: Promise<void> | undefined;
  #error: unknown;
  #disposed = false;
  #generation = 0;

  constructor(options: AutosaveCoordinatorOptions) {
    this.#save = options.save;
    this.#delayMs = Math.max(0, options.delayMs ?? 500);
    this.#onStateChange = options.onStateChange;
  }

  get snapshot(): AutosaveSnapshot {
    return this.#error === undefined
      ? { state: this.#state }
      : { state: this.#state, error: this.#error };
  }

  schedule(document: DiagramDocumentV1): void {
    this.#assertActive();
    this.#pending = validateDiagramDocument(document);
    this.#error = undefined;
    this.#setState('pending');
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.flush().catch(() => {
        // The observable error state is the notification path for timed saves.
      });
    }, this.#delayMs);
  }

  async flush(): Promise<void> {
    this.#assertActive();
    this.#clearTimer();
    if (this.#inFlight !== undefined) {
      await this.#inFlight;
      if (this.#pending !== undefined) await this.flush();
      return;
    }

    const document = this.#pending;
    if (document === undefined) {
      if (this.#state !== 'error') this.#setState('idle');
      return;
    }

    this.#pending = undefined;
    this.#setState('saving');
    const generation = this.#generation;
    const operation = this.#save(document);
    this.#inFlight = operation;
    try {
      await operation;
      if (generation === this.#generation) {
        this.#error = undefined;
        this.#setState(this.#hasPending() ? 'pending' : 'idle');
      }
    } catch (error) {
      if (generation === this.#generation) {
        if (!this.#hasPending()) this.#pending = document;
        this.#error = error;
        this.#setState('error');
      }
      throw error;
    } finally {
      this.#inFlight = undefined;
    }
  }

  async retry(): Promise<void> {
    this.#assertActive();
    this.#error = undefined;
    await this.flush();
  }

  cancel(): void {
    this.#assertActive();
    this.#generation += 1;
    this.#clearTimer();
    this.#pending = undefined;
    this.#error = undefined;
    this.#setState(this.#inFlight === undefined ? 'idle' : 'saving');
  }

  async cancelAndWait(): Promise<void> {
    this.cancel();
    const operation = this.#inFlight;
    if (operation !== undefined) {
      try {
        await operation;
      } catch {
        // Cancellation intentionally discards the result and error of old work.
      }
    }
    if (!this.#disposed) this.#setState('idle');
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#clearTimer();
    this.#pending = undefined;
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  #setState(state: AutosaveState): void {
    this.#state = state;
    this.#onStateChange?.(this.snapshot);
  }

  #hasPending(): boolean {
    return this.#pending !== undefined;
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('AutosaveCoordinator has been disposed.');
  }
}
