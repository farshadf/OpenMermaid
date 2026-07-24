import { createDiagramDocument } from '@lib/documents';
import { DeleteUndoManager, IndexedDbDiagramRepository } from '@lib/storage';
import { describe, expect, it } from 'vitest';

describe('DeleteUndoManager', () => {
  it('restores a deleted document during the undo window and expires afterward', async () => {
    let currentTime = Date.parse('2026-07-21T10:00:00.000Z');
    const repository = new IndexedDbDiagramRepository({
      databaseName: `openmermaid-test-undo-${crypto.randomUUID()}`,
      enableBroadcast: false,
    });
    const document = createDiagramDocument({
      id: 'undo-document',
      title: 'Recover me',
      now: '2026-07-21T10:00:00.000Z',
    });
    await repository.put(document);
    const manager = new DeleteUndoManager(repository, {
      undoWindowMs: 1_000,
      now: () => currentTime,
      createToken: () => 'undo-token',
    });

    const deletion = await manager.delete(document.id);
    expect(deletion).toMatchObject({ token: 'undo-token', title: 'Recover me' });
    expect(await repository.get(document.id)).toBeUndefined();
    expect(await manager.undo('undo-token')).toBe(true);
    expect(await repository.get(document.id)).toEqual(document);

    const secondDeletion = await manager.delete(document.id);
    currentTime += 1_000;
    expect(await manager.undo(secondDeletion?.token ?? '')).toBe(false);
    expect(await repository.get(document.id)).toBeUndefined();
    manager.dispose();
    await repository.close();
  });

  it('keeps the default undo available until explicit dismissal', async () => {
    const repository = new IndexedDbDiagramRepository({
      databaseName: `openmermaid-test-undo-default-${crypto.randomUUID()}`,
      enableBroadcast: false,
    });
    const manager = new DeleteUndoManager(repository, { createToken: () => 'persistent-token' });
    expect(await manager.delete('missing-document')).toBeUndefined();

    const document = createDiagramDocument({ id: 'persistent-undo' });
    await repository.put(document);
    const deletion = await manager.delete(document.id);
    expect(deletion?.expiresAt).toBeUndefined();
    manager.dismiss(deletion?.token ?? '');
    expect(await manager.undo(deletion?.token ?? '')).toBe(false);

    manager.dispose();
    await repository.close();
  });
});
