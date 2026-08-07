import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNoteSaveState } from './use-note-save-state';

describe('useNoteSaveState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('debounces a dirty draft and advances its base version after save', async () => {
    const save = vi.fn().mockResolvedValue({ editVersion: 2 });
    const { result } = renderHook(() =>
      useNoteSaveState({ noteId: 'note-1', initialVersion: 1, save })
    );

    act(() => result.current.markDirty({ title: 'Novo título' }));
    expect(result.current.status).toBe('dirty');
    await act(() => vi.advanceTimersByTimeAsync(900));

    expect(save).toHaveBeenCalledWith({ title: 'Novo título' }, 1);
    expect(result.current.status).toBe('saved');
    expect(result.current.baseVersion).toBe(2);
  });

  it('holds a conflict without automatic retry', async () => {
    const save = vi.fn().mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
    const { result } = renderHook(() =>
      useNoteSaveState({ noteId: 'note-1', initialVersion: 1, save })
    );

    act(() => result.current.markDirty({ title: 'Concorrente' }));
    await act(() => vi.advanceTimersByTimeAsync(900));

    expect(result.current.status).toBe('conflict');
    expect(save).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('operis.notes.draft:note-1')).toContain('Concorrente');
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('retains a failed draft and clears it after a successful retry', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ editVersion: 2 });
    const { result } = renderHook(() =>
      useNoteSaveState({ noteId: 'note-1', initialVersion: 1, save })
    );

    act(() => result.current.markDirty({ title: 'Rascunho local' }));
    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(result.current.status).toBe('failed');
    expect(localStorage.getItem('operis.notes.draft:note-1')).toContain('Rascunho local');

    await act(() => result.current.retry());
    expect(result.current.status).toBe('saved');
    expect(localStorage.getItem('operis.notes.draft:note-1')).toBeNull();
  });
});
