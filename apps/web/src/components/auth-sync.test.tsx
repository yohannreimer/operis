import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSync } from './auth-sync';

const apiMock = vi.hoisted(() => ({
  setAuthTokenGetter: vi.fn()
}));

vi.mock('@clerk/react', () => ({
  useAuth: () => ({
    getToken: async () => 'clerk-token'
  })
}));

vi.mock('../api', () => apiMock);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AuthSync', () => {
  it('registers the Clerk token without checking the Hub in the browser', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const view = render(<AuthSync />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiMock.setAuthTokenGetter).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(() => view.unmount()).not.toThrow();
  });
});
