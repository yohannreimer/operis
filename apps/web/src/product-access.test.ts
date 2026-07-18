import { describe, expect, it, vi } from 'vitest';
import { resolveProductAccess } from './product-access';

function hubResponse(allowed: boolean, ok = true) {
  return {
    ok,
    json: async () => ({ allowed })
  };
}

describe('resolveProductAccess', () => {
  it('waits for a Hub entitlement that becomes available immediately after sign-in', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(hubResponse(false))
      .mockResolvedValueOnce(hubResponse(true));
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      resolveProductAccess({
        getToken: async () => 'clerk-token',
        request,
        wait
      })
    ).resolves.toBe('allowed');

    expect(request).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('denies access only after every settlement attempt remains negative', async () => {
    const request = vi.fn().mockResolvedValue(hubResponse(false));
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      resolveProductAccess({
        getToken: async () => 'clerk-token',
        request,
        wait
      })
    ).resolves.toBe('denied');

    expect(request).toHaveBeenCalledTimes(4);
    expect(wait).toHaveBeenCalledTimes(3);
  });

  it('does not turn a Hub transport failure into a denial redirect', async () => {
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      resolveProductAccess({
        getToken: async () => 'clerk-token',
        request: vi.fn().mockRejectedValue(new TypeError('Network error')),
        wait
      })
    ).resolves.toBe('unavailable');

    expect(wait).not.toHaveBeenCalled();
  });
});
