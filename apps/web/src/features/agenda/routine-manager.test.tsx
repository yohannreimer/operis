import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCommitments: vi.fn(),
  updateCommitment: vi.fn()
}));

vi.mock('../../api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api')>();
  return { ...original, api: { ...original.api, ...mocks } };
});

import { RoutineManager } from './routine-manager';

describe('RoutineManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCommitments.mockResolvedValue([
      {
        id: 'routine_1',
        title: 'Academia',
        status: 'ativo',
        type: 'fixo',
        startTime: '09:00',
        durationMin: 60,
        recurrenceDays: ['THURSDAY'],
        recurrenceEnd: null,
        date: null,
        workspaceId: null,
        projectId: null,
        description: null,
        createdAt: '',
        updatedAt: '',
        exceptions: []
      }
    ]);
    mocks.updateCommitment.mockResolvedValue({});
  });

  it('lists recurring commitments and can pause one', async () => {
    render(<RoutineManager />);

    expect(await screen.findByText('Academia')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar Academia' }));
    await waitFor(() =>
      expect(mocks.updateCommitment).toHaveBeenCalledWith('routine_1', { status: 'pausado' })
    );
  });
});
