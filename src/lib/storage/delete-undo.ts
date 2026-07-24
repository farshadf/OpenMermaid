import {
  validateDiagramDocument,
  type DiagramDocumentV1,
  type DiagramRepository,
} from '../documents';

export interface UndoableDeletion {
  token: string;
  documentId: string;
  title: string;
  expiresAt?: string;
}

interface PendingDeletion {
  document: DiagramDocumentV1;
  expiresAt?: number;
  timer?: ReturnType<typeof setTimeout>;
}

export interface DeleteUndoManagerOptions {
  undoWindowMs?: number;
  now?: () => number;
  createToken?: () => string;
}

function defaultToken(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `undo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export class DeleteUndoManager {
  readonly #repository: DiagramRepository;
  readonly #undoWindowMs: number | undefined;
  readonly #now: () => number;
  readonly #createToken: () => string;
  readonly #pending = new Map<string, PendingDeletion>();

  constructor(repository: DiagramRepository, options: DeleteUndoManagerOptions = {}) {
    this.#repository = repository;
    this.#undoWindowMs =
      options.undoWindowMs === undefined ? undefined : Math.max(1, options.undoWindowMs);
    this.#now = options.now ?? Date.now;
    this.#createToken = options.createToken ?? defaultToken;
  }

  async delete(documentId: string): Promise<UndoableDeletion | undefined> {
    const document = await this.#repository.get(documentId);
    if (document === undefined) return undefined;
    await this.#repository.delete(documentId);

    const token = this.#createToken();
    const expiresAt =
      this.#undoWindowMs === undefined ? undefined : this.#now() + this.#undoWindowMs;
    const timer =
      this.#undoWindowMs === undefined
        ? undefined
        : setTimeout(() => this.#expire(token), this.#undoWindowMs);
    this.#pending.set(token, {
      document: validateDiagramDocument(document),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      ...(timer === undefined ? {} : { timer }),
    });
    return {
      token,
      documentId: document.id,
      title: document.title,
      ...(expiresAt === undefined ? {} : { expiresAt: new Date(expiresAt).toISOString() }),
    };
  }

  async undo(token: string): Promise<boolean> {
    const pending = this.#pending.get(token);
    if (pending === undefined) return false;
    if (pending.expiresAt !== undefined && pending.expiresAt <= this.#now()) {
      this.#expire(token);
      return false;
    }

    await this.#repository.put(pending.document);
    if (pending.timer !== undefined) clearTimeout(pending.timer);
    this.#pending.delete(token);
    return true;
  }

  dismiss(token: string): void {
    this.#expire(token);
  }

  dispose(): void {
    for (const pending of this.#pending.values()) {
      if (pending.timer !== undefined) clearTimeout(pending.timer);
    }
    this.#pending.clear();
  }

  #expire(token: string): void {
    const pending = this.#pending.get(token);
    if (pending?.timer !== undefined) clearTimeout(pending.timer);
    this.#pending.delete(token);
  }
}
