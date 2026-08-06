import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InboxItem } from '../../api';
import { useInboxController } from './use-inbox-controller';

const apiMock = vi.hoisted(() => ({
  getInbox: vi.fn(),
  getWorkspaces: vi.fn(),
  createInboxItem: vi.fn(),
  updateInboxItem: vi.fn(),
  deleteInboxItem: vi.fn(),
  convertInboxItem: vi.fn(),
  executeInboxItem: vi.fn()
}));

vi.mock('../../api', () => ({ api: apiMock }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
}));

const whatsappItem: InboxItem = {
  id: 'inbox_1',
  content: 'Confirmar briefing recebido',
  source: 'whatsapp',
  status: 'pendente',
  workspaceId: null,
  inboxContextId: null,
  position: 0,
  waitingDate: null,
  waitingPerson: null,
  waitingNote: null,
  scheduledAt: null,
  convertedTaskId: null,
  createdAt: '2026-08-05T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:00.000Z',
  workspace: null,
  inboxContext: null
};

describe('useInboxController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getInbox.mockResolvedValue({ items: [whatsappItem], contexts: [] });
    apiMock.getWorkspaces.mockResolvedValue([]);
  });

  it('loads the requested view and preserves WhatsApp origin', async () => {
    const { result } = renderHook(() => useInboxController({
      view: 'unprocessed', date: '2026-08-05'
    }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiMock.getInbox).toHaveBeenCalledWith({
      filter: undefined, view: 'unprocessed', date: '2026-08-05'
    });
    expect(result.current.items[0]?.source).toBe('whatsapp');
  });

  it('creates captures and keeps them in local state', async () => {
    const created = { ...whatsappItem, id: 'inbox_2', source: 'app' as const };
    apiMock.createInboxItem.mockResolvedValue(created);
    const { result } = renderHook(() => useInboxController());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.create('Nova captura'));

    expect(result.current.items[0]).toEqual(created);
  });

  it('sets an item to waiting', async () => {
    const updated = {
      ...whatsappItem,
      status: 'aguardando' as const,
      waitingDate: '2026-08-06T00:00:00.000Z'
    };
    apiMock.updateInboxItem.mockResolvedValue(updated);
    const { result } = renderHook(() => useInboxController());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.setWaiting(whatsappItem, '2026-08-06'));

    expect(result.current.items[0]?.status).toBe('aguardando');
  });

  it('restores an optimistic deletion when the API fails', async () => {
    apiMock.deleteInboxItem.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useInboxController());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.remove(whatsappItem));

    expect(result.current.items).toEqual([whatsappItem]);
  });
});
