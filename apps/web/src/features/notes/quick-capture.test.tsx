import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '../../api';
import { QUICK_CAPTURE_DRAFT_KEY } from './capture';
import { QuickCapture } from './quick-capture';

const apiMock = vi.hoisted(() => ({ createNote: vi.fn() }));
vi.mock('../../api', () => ({ api: apiMock }));

const createdNote: Note = {
  id: 'note-1',
  title: 'Ideia nova',
  editVersion: 1,
  type: 'geral',
  tags: [],
  pinned: false,
  folderId: null,
  createdAt: '2026-08-07T12:00:00.000Z',
  updatedAt: '2026-08-07T12:00:00.000Z'
};

describe('QuickCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear()
    });
    localStorage.clear();
    apiMock.createNote.mockResolvedValue(createdNote);
  });

  it('captures on Enter and keeps Shift+Enter for a new line', async () => {
    const onCaptured = vi.fn();
    render(<QuickCapture onCaptured={onCaptured} />);
    const input = screen.getByPlaceholderText('Capture uma ideia, frase ou lembrete…');

    fireEvent.change(input, { target: { value: 'Ideia nova' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(apiMock.createNote).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false, isComposing: false });

    await waitFor(() =>
      expect(apiMock.createNote).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Ideia nova', contentBlocks: [], folderId: null })
      )
    );
    expect(screen.getByText('Capturado')).toBeVisible();
    expect(onCaptured).toHaveBeenCalledWith(createdNote);
    expect(input).toHaveValue('');
  });

  it('preserves a failed capture as a local draft and offers retry', async () => {
    apiMock.createNote.mockRejectedValueOnce(new Error('offline'));
    render(<QuickCapture onCaptured={vi.fn()} />);
    const input = screen.getByPlaceholderText('Capture uma ideia, frase ou lembrete…');

    fireEvent.change(input, { target: { value: 'Ideia que não pode sumir' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false, isComposing: false });

    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    expect(input).toHaveValue('Ideia que não pode sumir');
    expect(window.localStorage.getItem(QUICK_CAPTURE_DRAFT_KEY)).toBe(
      'Ideia que não pode sumir'
    );
  });
});
