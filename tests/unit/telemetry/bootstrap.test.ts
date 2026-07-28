import { enforceGlobalPrivacyControl } from '../../../src/lib/telemetry/bootstrap';
import { describe, expect, it, vi } from 'vitest';

describe('aggregate telemetry bootstrap privacy control', () => {
  it('forces sharing off and clears the queue when GPC is present', async () => {
    const disable = vi.fn(() => true);
    const clear = vi.fn(() => Promise.resolve(true));

    expect(enforceGlobalPrivacyControl(() => true, disable, clear)).toBe(true);
    expect(disable).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    await clear.mock.results[0]?.value;
  });

  it('does not change state when GPC is absent', () => {
    const disable = vi.fn(() => true);
    const clear = vi.fn(() => Promise.resolve(true));
    expect(enforceGlobalPrivacyControl(() => false, disable, clear)).toBe(false);
    expect(disable).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});
