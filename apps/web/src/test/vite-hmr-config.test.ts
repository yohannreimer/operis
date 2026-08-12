import { describe, expect, it, vi } from 'vitest';

import { forceFullReloadForStructuralHookChanges } from '../../vite.config';

describe('forceFullReloadForStructuralHookChanges', () => {
  it('forces a clean reload when the Today workspace hook module changes', async () => {
    const plugin = forceFullReloadForStructuralHookChanges();
    const invalidateModule = vi.fn();
    const send = vi.fn();
    const moduleNode = { id: '/src/features/today/use-today-workspace.ts' };

    const result = await plugin.handleHotUpdate({
      file: '/repo/apps/web/src/features/today/use-today-workspace.ts',
      timestamp: 123,
      modules: [moduleNode],
      read: vi.fn(),
      server: {
        moduleGraph: { invalidateModule },
        ws: { send }
      }
    } as never);

    expect(invalidateModule).toHaveBeenCalledWith(moduleNode, expect.any(Set), 123, true);
    expect(send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
    expect(result).toEqual([]);
  });

  it('leaves unrelated modules on the normal React refresh path', async () => {
    const plugin = forceFullReloadForStructuralHookChanges();
    const send = vi.fn();

    const result = await plugin.handleHotUpdate({
      file: '/repo/apps/web/src/components/button.tsx',
      timestamp: 123,
      modules: [],
      read: vi.fn(),
      server: {
        moduleGraph: { invalidateModule: vi.fn() },
        ws: { send }
      }
    } as never);

    expect(send).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});
