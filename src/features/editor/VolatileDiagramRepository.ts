import type { DiagramDocumentV1, DiagramRepository } from '@lib/documents';

export class VolatileDiagramRepository implements DiagramRepository {
  readonly #documents = new Map<string, DiagramDocumentV1>();

  list(): Promise<DiagramDocumentV1[]> {
    return Promise.resolve(
      [...this.#documents.values()].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    );
  }

  get(id: string): Promise<DiagramDocumentV1 | undefined> {
    return Promise.resolve(this.#documents.get(id));
  }

  put(document: DiagramDocumentV1): Promise<void> {
    this.#documents.set(document.id, structuredClone(document));
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.#documents.delete(id);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.#documents.clear();
    return Promise.resolve();
  }
}
