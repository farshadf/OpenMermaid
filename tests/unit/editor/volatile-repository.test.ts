import { describe, expect, it } from 'vitest';

import { createDiagramDocument } from '@lib/documents';
import { VolatileDiagramRepository } from '@features/editor/VolatileDiagramRepository';

describe('VolatileDiagramRepository', () => {
  it('preserves a usable workspace when IndexedDB is unavailable', async () => {
    const repository = new VolatileDiagramRepository();
    const older = createDiagramDocument({
      id: 'older',
      title: 'Older',
      now: '2026-01-01T00:00:00.000Z',
    });
    const newer = createDiagramDocument({
      id: 'newer',
      title: 'Newer',
      now: '2026-01-02T00:00:00.000Z',
    });
    await repository.put(older);
    await repository.put(newer);
    expect((await repository.list()).map(({ id }) => id)).toEqual(['newer', 'older']);
    await repository.delete('newer');
    expect(await repository.get('newer')).toBeUndefined();
    await repository.clear();
    expect(await repository.list()).toEqual([]);
  });
});
