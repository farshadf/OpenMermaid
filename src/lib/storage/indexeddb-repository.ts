import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import {
  MERMAID_VERSION,
  migrateDiagramDocument,
  validateDiagramDocument,
  validateDocumentId,
  type DiagramDocumentV1,
  type DiagramRepository,
} from '../documents';
import {
  isDocumentChangeNotification,
  type BroadcastChannelFactory,
  type BroadcastChannelLike,
  type DocumentChangeNotification,
} from './change-channel';
import { normalizeStorageError, RevisionConflictError } from './errors';

const DATABASE_VERSION = 1;
const DEFAULT_DATABASE_NAME = 'openmermaid';
const DEFAULT_CHANNEL_NAME = 'openmermaid-documents';

interface OpenMermaidDatabase extends DBSchema {
  documents: {
    key: string;
    value: DiagramDocumentV1;
    indexes: { 'by-updated-at': string };
  };
}

export interface IndexedDbRepositoryOptions {
  databaseName?: string;
  channelName?: string;
  senderId?: string;
  fallbackMermaidVersion?: string;
  enableBroadcast?: boolean;
  broadcastChannelFactory?: BroadcastChannelFactory;
}

export interface RepositoryChangeEvent extends DocumentChangeNotification {
  origin: 'local' | 'external';
}

export type RepositoryChangeListener = (event: RepositoryChangeEvent) => void;

function generateSenderId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function defaultBroadcastChannelFactory(name: string): BroadcastChannelLike {
  return new globalThis.BroadcastChannel(name);
}

export class IndexedDbDiagramRepository implements DiagramRepository {
  readonly databaseName: string;

  readonly #senderId: string;
  readonly #fallbackMermaidVersion: string;
  readonly #listeners = new Set<RepositoryChangeListener>();
  #database: Promise<IDBPDatabase<OpenMermaidDatabase>> | undefined;
  #channel: BroadcastChannelLike | undefined;
  #closed = false;
  #lastSkippedRecordCount = 0;

  constructor(options: IndexedDbRepositoryOptions = {}) {
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
    this.#senderId = options.senderId ?? generateSenderId();
    this.#fallbackMermaidVersion = options.fallbackMermaidVersion ?? MERMAID_VERSION;

    const canBroadcast =
      options.enableBroadcast !== false &&
      (options.broadcastChannelFactory !== undefined || 'BroadcastChannel' in globalThis);
    if (canBroadcast) {
      try {
        const factory = options.broadcastChannelFactory ?? defaultBroadcastChannelFactory;
        this.#channel = factory(options.channelName ?? DEFAULT_CHANNEL_NAME);
        this.#channel.onmessage = (event): void => {
          if (
            !isDocumentChangeNotification(event.data) ||
            event.data.senderId === this.#senderId ||
            this.#closed
          ) {
            return;
          }
          this.#emit({ ...event.data, origin: 'external' });
        };
      } catch {
        // BroadcastChannel is a conflict hint, not a persistence requirement.
        this.#channel = undefined;
      }
    }
  }

  get lastSkippedRecordCount(): number {
    return this.#lastSkippedRecordCount;
  }

  async #openDatabase(): Promise<IDBPDatabase<OpenMermaidDatabase>> {
    try {
      const database = await openDB<OpenMermaidDatabase>(this.databaseName, DATABASE_VERSION, {
        upgrade(database): void {
          if (!database.objectStoreNames.contains('documents')) {
            const store = database.createObjectStore('documents', { keyPath: 'id' });
            store.createIndex('by-updated-at', 'updatedAt');
          }
        },
      });
      database.onversionchange = (): void => database.close();
      return database;
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  #getDatabase(): Promise<IDBPDatabase<OpenMermaidDatabase>> {
    this.#database ??= this.#openDatabase();
    return this.#database;
  }

  async list(): Promise<DiagramDocumentV1[]> {
    this.#assertOpen();
    try {
      const database = await this.#getDatabase();
      const records = (await database.getAll('documents')) as unknown[];
      this.#lastSkippedRecordCount = 0;
      return records
        .flatMap((record) => {
          try {
            return [
              migrateDiagramDocument(record, {
                fallbackMermaidVersion: this.#fallbackMermaidVersion,
              }),
            ];
          } catch {
            this.#lastSkippedRecordCount += 1;
            return [];
          }
        })
        .sort((left, right) => {
          const byDate = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
          return byDate === 0 ? left.id.localeCompare(right.id) : byDate;
        });
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async search(query: string): Promise<DiagramDocumentV1[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const documents = await this.list();
    if (normalizedQuery.length === 0) return documents;
    return documents.filter(
      (document) =>
        document.title.toLocaleLowerCase().includes(normalizedQuery) ||
        document.source.toLocaleLowerCase().includes(normalizedQuery),
    );
  }

  async get(id: string): Promise<DiagramDocumentV1 | undefined> {
    this.#assertOpen();
    const validId = validateDocumentId(id);
    try {
      const database = await this.#getDatabase();
      const record = (await database.get('documents', validId)) as unknown;
      if (record === undefined) return undefined;
      return migrateDiagramDocument(record, {
        fallbackMermaidVersion: this.#fallbackMermaidVersion,
      });
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async put(document: DiagramDocumentV1): Promise<void> {
    this.#assertOpen();
    const incoming = validateDiagramDocument(document);
    try {
      const database = await this.#getDatabase();
      const transaction = database.transaction('documents', 'readwrite');
      const storedValue = (await transaction.store.get(incoming.id)) as unknown;
      if (storedValue !== undefined) {
        const stored = migrateDiagramDocument(storedValue, {
          fallbackMermaidVersion: this.#fallbackMermaidVersion,
        });
        if (incoming.revision !== stored.revision + 1) {
          throw new RevisionConflictError(incoming, stored);
        }
      }
      await transaction.store.put(incoming);
      await transaction.done;
      this.#publish({ kind: 'put', id: incoming.id, revision: incoming.revision });
    } catch (error) {
      if (error instanceof RevisionConflictError) throw error;
      throw normalizeStorageError(error);
    }
  }

  async delete(id: string): Promise<void> {
    this.#assertOpen();
    const validId = validateDocumentId(id);
    try {
      const database = await this.#getDatabase();
      const transaction = database.transaction('documents', 'readwrite');
      const existing = await transaction.store.get(validId);
      if (existing !== undefined) await transaction.store.delete(validId);
      await transaction.done;
      if (existing !== undefined) this.#publish({ kind: 'delete', id: validId });
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async clear(): Promise<void> {
    this.#assertOpen();
    try {
      const database = await this.#getDatabase();
      await database.clear('documents');
      this.#publish({ kind: 'clear' });
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  subscribe(listener: RepositoryChangeListener): () => void {
    this.#assertOpen();
    this.#listeners.add(listener);
    return (): void => {
      this.#listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#listeners.clear();
    if (this.#channel !== undefined) {
      this.#channel.onmessage = null;
      this.#channel.close();
      this.#channel = undefined;
    }
    const databasePromise = this.#database;
    if (databasePromise === undefined) return;
    try {
      const database = await databasePromise;
      database.close();
    } catch {
      // A failed open is already reported by the operation that awaited it.
    }
  }

  #publish(
    change:
      | { kind: 'put'; id: string; revision: number }
      | { kind: 'delete'; id: string }
      | { kind: 'clear' },
  ): void {
    const notification: DocumentChangeNotification = {
      protocol: 'openmermaid-documents-v1',
      senderId: this.#senderId,
      timestamp: new Date().toISOString(),
      ...change,
    };
    this.#emit({ ...notification, origin: 'local' });
    try {
      this.#channel?.postMessage(notification);
    } catch {
      // Persistence succeeded; callers can still detect conflicts during put.
    }
  }

  #emit(event: RepositoryChangeEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw normalizeStorageError(new DOMException('Repository is closed.', 'InvalidStateError'));
    }
  }
}
