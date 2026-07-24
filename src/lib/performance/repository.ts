import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { LocalVitalSampleV1, LocalVitalsStats } from './contracts';
import { setLocalVitalsHistoryEnabled } from './preference';
import { isLocalVitalSampleV1 } from './validation';

export const LOCAL_VITALS_DATABASE_NAME = 'openmermaid-performance';
export const LOCAL_VITALS_STORE_NAME = 'vital-samples';
export const LOCAL_VITALS_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const LOCAL_VITALS_MAX_RECORDS = 1_000;
export const LOCAL_VITALS_MAX_BYTES = 1_048_576;
export const LOCAL_VITALS_MAX_RECORD_BYTES = 2_048;

interface LocalVitalsDatabase extends DBSchema {
  'vital-samples': {
    key: string;
    value: LocalVitalSampleV1;
    indexes: {
      'by-measured-at': string;
      'by-name': LocalVitalSampleV1['name'];
      'by-page-kind': LocalVitalSampleV1['pageKind'];
    };
  };
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export class LocalVitalsRepository {
  readonly databaseName: string;
  #database: Promise<IDBPDatabase<LocalVitalsDatabase>> | undefined;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(databaseName = LOCAL_VITALS_DATABASE_NAME) {
    this.databaseName = databaseName;
  }

  async #open(): Promise<IDBPDatabase<LocalVitalsDatabase>> {
    this.#database ??= openDB<LocalVitalsDatabase>(this.databaseName, 1, {
      upgrade(database) {
        if (database.objectStoreNames.contains(LOCAL_VITALS_STORE_NAME)) return;
        const store = database.createObjectStore(LOCAL_VITALS_STORE_NAME, { keyPath: 'id' });
        store.createIndex('by-measured-at', 'measuredAt');
        store.createIndex('by-name', 'name');
        store.createIndex('by-page-kind', 'pageKind');
      },
    });
    return this.#database;
  }

  async #prune(now: number): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction(LOCAL_VITALS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(LOCAL_VITALS_STORE_NAME);
    const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()]);
    const cutoff = now - LOCAL_VITALS_RETENTION_MS;
    const candidates: { key: string; value: LocalVitalSampleV1 }[] = [];
    for (const [index, value] of values.entries()) {
      const key = keys[index];
      if (typeof key === 'string' && isLocalVitalSampleV1(value)) {
        candidates.push({ key, value });
      }
    }
    const retainedCandidates = candidates
      .filter(({ value }) => Date.parse(value.measuredAt) >= cutoff)
      .sort((left, right) => right.value.measuredAt.localeCompare(left.value.measuredAt));

    const keep = new Set<string>();
    let keptBytes = 0;
    for (const entry of retainedCandidates) {
      const bytes = byteLength(entry.value);
      if (keep.size >= LOCAL_VITALS_MAX_RECORDS || keptBytes + bytes > LOCAL_VITALS_MAX_BYTES) {
        continue;
      }
      keep.add(entry.key);
      keptBytes += bytes;
    }
    for (const key of keys) {
      if (typeof key !== 'string' || !keep.has(key)) await store.delete(key);
    }
    await transaction.done;
  }

  upsert(sample: LocalVitalSampleV1, now = Date.now()): Promise<void> {
    if (!isLocalVitalSampleV1(sample)) {
      return Promise.reject(new TypeError('Invalid local Web Vital sample.'));
    }
    if (byteLength(sample) > LOCAL_VITALS_MAX_RECORD_BYTES) {
      return Promise.reject(new TypeError('Local Web Vital sample exceeds the record limit.'));
    }
    const operation = this.#writeQueue.then(async () => {
      const database = await this.#open();
      await database.put(LOCAL_VITALS_STORE_NAME, sample);
      await this.#prune(now);
    });
    this.#writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async list(now = Date.now()): Promise<LocalVitalSampleV1[]> {
    await this.#writeQueue;
    const database = await this.#open();
    const values = await database.getAll(LOCAL_VITALS_STORE_NAME);
    const cutoff = now - LOCAL_VITALS_RETENTION_MS;
    return values
      .filter(isLocalVitalSampleV1)
      .filter((sample) => Date.parse(sample.measuredAt) >= cutoff)
      .sort((left, right) => right.measuredAt.localeCompare(left.measuredAt));
  }

  async stats(now = Date.now()): Promise<LocalVitalsStats> {
    await this.#writeQueue;
    const database = await this.#open();
    const values = await database.getAll(LOCAL_VITALS_STORE_NAME);
    const valid = values.filter(isLocalVitalSampleV1);
    const retained = valid.filter(
      (sample) => Date.parse(sample.measuredAt) >= now - LOCAL_VITALS_RETENTION_MS,
    );
    const ordered = retained.map((sample) => sample.measuredAt).sort();
    const oldestAt = ordered[0];
    const newestAt = ordered.at(-1);
    return {
      count: retained.length,
      estimatedBytes: retained.reduce((total, sample) => total + byteLength(sample), 0),
      skippedCorruptRecords: values.length - valid.length,
      ...(oldestAt === undefined ? {} : { oldestAt }),
      ...(newestAt === undefined ? {} : { newestAt }),
    };
  }

  async clear(): Promise<void> {
    await this.#writeQueue;
    const database = await this.#open();
    await database.clear(LOCAL_VITALS_STORE_NAME);
  }

  async close(): Promise<void> {
    await this.#writeQueue;
    const database = await this.#database;
    database?.close();
    this.#database = undefined;
  }
}

export async function clearLocalVitalsHistory(): Promise<void> {
  setLocalVitalsHistoryEnabled(false);
  const repository = new LocalVitalsRepository();
  try {
    await repository.clear();
  } finally {
    await repository.close();
  }
}
