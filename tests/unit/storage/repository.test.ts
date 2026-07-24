import { createDiagramDocument, updateDiagramDocument } from '@lib/documents';
import {
  IndexedDbDiagramRepository,
  RevisionConflictError,
  type BroadcastChannelLike,
  type RepositoryChangeEvent,
} from '@lib/storage';
import { openDB, type DBSchema } from 'idb';
import { describe, expect, it } from 'vitest';

const FIRST_TIME = '2026-07-21T10:00:00.000Z';
const SECOND_TIME = '2026-07-21T11:00:00.000Z';

interface LegacyTestDatabase extends DBSchema {
  documents: {
    key: string;
    value: unknown;
  };
}

function databaseName(label: string): string {
  return `openmermaid-test-${label}-${crypto.randomUUID()}`;
}

class TestBroadcastBus {
  readonly channels: TestChannel[] = [];

  create = (): BroadcastChannelLike => {
    const channel = new TestChannel(this);
    this.channels.push(channel);
    return channel;
  };
}

class TestChannel implements BroadcastChannelLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  #closed = false;

  constructor(private readonly bus: TestBroadcastBus) {}

  postMessage(message: unknown): void {
    for (const channel of this.bus.channels) {
      if (channel !== this && !channel.#closed) {
        channel.onmessage?.(new MessageEvent('message', { data: message }));
      }
    }
  }

  close(): void {
    this.#closed = true;
  }
}

describe('IndexedDbDiagramRepository', () => {
  it('supports CRUD, modified-date sorting, and local search', async () => {
    const repository = new IndexedDbDiagramRepository({
      databaseName: databaseName('crud'),
      enableBroadcast: false,
    });
    const older = createDiagramDocument({
      id: 'older',
      title: 'API sequence',
      source: 'sequenceDiagram\n  Alice->>Bob: Request',
      now: FIRST_TIME,
    });
    const newer = createDiagramDocument({
      id: 'newer',
      title: 'Deployment map',
      source: 'flowchart LR\n  Build --> Ship',
      now: SECOND_TIME,
    });

    await repository.put(older);
    await repository.put(newer);
    expect((await repository.list()).map(({ id }) => id)).toEqual(['newer', 'older']);
    expect((await repository.search('alice')).map(({ id }) => id)).toEqual(['older']);
    expect(await repository.get('newer')).toEqual(newer);

    const renamed = updateDiagramDocument(newer, { title: 'Production deployment' }, SECOND_TIME);
    await repository.put(renamed);
    expect((await repository.get('newer'))?.title).toBe('Production deployment');

    await repository.delete('older');
    expect(await repository.get('older')).toBeUndefined();
    await repository.clear();
    expect(await repository.list()).toEqual([]);
    await repository.close();
  });

  it('rejects stale and skipped revisions with the stored recovery copy', async () => {
    const repository = new IndexedDbDiagramRepository({
      databaseName: databaseName('conflict'),
      enableBroadcast: false,
    });
    const original = createDiagramDocument({ id: 'conflict', now: FIRST_TIME });
    await repository.put(original);
    const accepted = updateDiagramDocument(original, { source: 'graph LR\n A --> B' }, SECOND_TIME);
    await repository.put(accepted);

    await expect(
      repository.put(updateDiagramDocument(original, { title: 'stale' }, SECOND_TIME)),
    ).rejects.toMatchObject({
      name: 'RevisionConflictError',
      storedRevision: 1,
      incomingRevision: 1,
      storedDocument: accepted,
    } satisfies Partial<RevisionConflictError>);
    await expect(repository.put({ ...accepted, revision: 3 })).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    await repository.close();
  });

  it('migrates a valid pre-release record when it is read from IndexedDB', async () => {
    const name = databaseName('migration');
    const rawDatabase = await openDB<LegacyTestDatabase>(name, 1, {
      upgrade(database) {
        database.createObjectStore('documents', { keyPath: 'id' });
      },
    });
    await rawDatabase.put('documents', {
      id: 'legacy-record',
      name: 'Legacy state diagram',
      content: 'stateDiagram-v2\n  [*] --> Ready',
      theme: 'neutral',
      background: 'light',
      revision: 4,
      createdAt: FIRST_TIME,
      updatedAt: SECOND_TIME,
    });
    rawDatabase.close();

    const repository = new IndexedDbDiagramRepository({
      databaseName: name,
      enableBroadcast: false,
    });
    await expect(repository.get('legacy-record')).resolves.toMatchObject({
      schemaVersion: 1,
      title: 'Legacy state diagram',
      source: 'stateDiagram-v2\n  [*] --> Ready',
      createdWithMermaid: '11.16.0',
      appearance: { theme: 'neutral', background: 'light' },
      revision: 4,
    });
    await repository.close();
  });

  it('keeps valid records available when another stored record is unreadable', async () => {
    const name = databaseName('corrupt-record');
    const rawDatabase = await openDB<LegacyTestDatabase>(name, 1, {
      upgrade(database) {
        database.createObjectStore('documents', { keyPath: 'id' });
      },
    });
    const valid = createDiagramDocument({ id: 'valid-record', now: FIRST_TIME });
    await rawDatabase.put('documents', valid);
    await rawDatabase.put('documents', { id: 'broken-record', schemaVersion: 99 });
    rawDatabase.close();

    const repository = new IndexedDbDiagramRepository({
      databaseName: name,
      enableBroadcast: false,
    });
    await expect(repository.list()).resolves.toEqual([valid]);
    expect(repository.lastSkippedRecordCount).toBe(1);
    await repository.close();
  });

  it('emits validated external tab notifications while retaining local events', async () => {
    const bus = new TestBroadcastBus();
    const sharedName = databaseName('broadcast');
    const first = new IndexedDbDiagramRepository({
      databaseName: sharedName,
      senderId: 'first-tab',
      broadcastChannelFactory: bus.create,
    });
    const second = new IndexedDbDiagramRepository({
      databaseName: sharedName,
      senderId: 'second-tab',
      broadcastChannelFactory: bus.create,
    });
    const firstEvents: RepositoryChangeEvent[] = [];
    const secondEvents: RepositoryChangeEvent[] = [];
    first.subscribe((event) => firstEvents.push(event));
    second.subscribe((event) => secondEvents.push(event));

    await first.put(createDiagramDocument({ id: 'broadcast-document', now: FIRST_TIME }));
    expect(firstEvents).toEqual([
      expect.objectContaining({ kind: 'put', origin: 'local', revision: 0 }),
    ]);
    expect(secondEvents).toEqual([
      expect.objectContaining({
        kind: 'put',
        origin: 'external',
        senderId: 'first-tab',
        revision: 0,
      }),
    ]);
    await first.close();
    await second.close();
  });
});
