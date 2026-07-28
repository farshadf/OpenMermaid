import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import { isQueuedTemplateUsageEventV1, type QueuedTemplateUsageEventV1 } from './contracts';
import { setTemplateUsageSharingEnabled } from './preference';

export const TEMPLATE_USAGE_DATABASE_NAME = 'openmermaid-telemetry';
export const TEMPLATE_USAGE_QUEUE_STORE = 'template-use-queue';
export const TEMPLATE_USAGE_QUEUE_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
export const TEMPLATE_USAGE_QUEUE_MAX_RECORDS = 64;
export const TEMPLATE_USAGE_QUEUE_MAX_BYTES = 16_384;
export const TEMPLATE_USAGE_QUEUE_MAX_RECORD_BYTES = 512;

interface TemplateUsageQueueDatabase extends DBSchema {
  'template-use-queue': {
    key: string;
    value: QueuedTemplateUsageEventV1;
    indexes: {
      'by-queued-at': string;
    };
  };
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export class TemplateUsageQueueRepository {
  readonly databaseName: string;
  #database: Promise<IDBPDatabase<TemplateUsageQueueDatabase>> | undefined;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(databaseName = TEMPLATE_USAGE_DATABASE_NAME) {
    this.databaseName = databaseName;
  }

  async #open(): Promise<IDBPDatabase<TemplateUsageQueueDatabase>> {
    this.#database ??= openDB<TemplateUsageQueueDatabase>(this.databaseName, 1, {
      upgrade(database) {
        if (database.objectStoreNames.contains(TEMPLATE_USAGE_QUEUE_STORE)) return;
        const store = database.createObjectStore(TEMPLATE_USAGE_QUEUE_STORE, {
          keyPath: 'eventId',
        });
        store.createIndex('by-queued-at', 'queuedAt');
      },
    });
    return this.#database;
  }

  async #prune(now: number): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction(TEMPLATE_USAGE_QUEUE_STORE, 'readwrite');
    const store = transaction.objectStore(TEMPLATE_USAGE_QUEUE_STORE);
    const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()]);
    const cutoff = now - TEMPLATE_USAGE_QUEUE_RETENTION_MS;
    const retained = values
      .filter(isQueuedTemplateUsageEventV1)
      .filter((event) => Date.parse(event.queuedAt) >= cutoff)
      .sort((left, right) => right.queuedAt.localeCompare(left.queuedAt));

    const keep = new Set<string>();
    let keptBytes = 0;
    for (const event of retained) {
      const bytes = byteLength(event);
      if (
        keep.size >= TEMPLATE_USAGE_QUEUE_MAX_RECORDS ||
        keptBytes + bytes > TEMPLATE_USAGE_QUEUE_MAX_BYTES
      ) {
        continue;
      }
      keep.add(event.eventId);
      keptBytes += bytes;
    }

    for (const key of keys) {
      if (typeof key !== 'string' || !keep.has(key)) await store.delete(key);
    }
    await transaction.done;
  }

  enqueue(event: QueuedTemplateUsageEventV1, now = Date.now()): Promise<void> {
    if (!isQueuedTemplateUsageEventV1(event)) {
      return Promise.reject(new TypeError('Invalid queued template usage event.'));
    }
    if (byteLength(event) > TEMPLATE_USAGE_QUEUE_MAX_RECORD_BYTES) {
      return Promise.reject(new TypeError('Queued template usage event exceeds the record limit.'));
    }

    const operation = this.#writeQueue.then(async () => {
      const database = await this.#open();
      await database.put(TEMPLATE_USAGE_QUEUE_STORE, event);
      await this.#prune(now);
    });
    this.#writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async list(now = Date.now()): Promise<QueuedTemplateUsageEventV1[]> {
    const pruning = this.#writeQueue.then(() => this.#prune(now));
    this.#writeQueue = pruning.catch(() => undefined);
    await pruning;
    const database = await this.#open();
    const values = await database.getAll(TEMPLATE_USAGE_QUEUE_STORE);
    return values
      .filter(isQueuedTemplateUsageEventV1)
      .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
  }

  remove(eventIds: readonly string[]): Promise<void> {
    const uniqueIds = [...new Set(eventIds)];
    const operation = this.#writeQueue.then(async () => {
      const database = await this.#open();
      const transaction = database.transaction(TEMPLATE_USAGE_QUEUE_STORE, 'readwrite');
      await Promise.all(
        uniqueIds.map((eventId) =>
          transaction.objectStore(TEMPLATE_USAGE_QUEUE_STORE).delete(eventId),
        ),
      );
      await transaction.done;
    });
    this.#writeQueue = operation.catch(() => undefined);
    return operation;
  }

  clear(): Promise<void> {
    const operation = this.#writeQueue.then(async () => {
      const database = await this.#open();
      await database.clear(TEMPLATE_USAGE_QUEUE_STORE);
    });
    this.#writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async close(): Promise<void> {
    await this.#writeQueue;
    const database = await this.#database;
    database?.close();
    this.#database = undefined;
  }
}

export async function clearTemplateUsageTelemetry(): Promise<boolean> {
  setTemplateUsageSharingEnabled(false);
  const repository = new TemplateUsageQueueRepository();
  try {
    await repository.clear();
    return true;
  } catch {
    return false;
  } finally {
    await repository.close().catch(() => undefined);
  }
}
