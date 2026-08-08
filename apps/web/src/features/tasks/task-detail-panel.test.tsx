import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TaskDetailPanel } from './task-detail-panel';
import { taskFixture } from './task-test-fixtures';

function props() {
  return {
    task: taskFixture(),
    detail: { subtasks: [], restrictions: [], history: [], multiBlock: null, loaded: true },
    workspaces: [{ id: 'workspace-1', name: 'Prymeira', type: 'empresa' as const }],
    projects: [], radar: null, mobile: false, loading: false, error: null,
    onClose: vi.fn(), onUpdate: vi.fn().mockResolvedValue(undefined),
    onPlanToday: vi.fn().mockResolvedValue(undefined), onRemoveToday: vi.fn().mockResolvedValue(undefined),
    onSchedule: vi.fn().mockResolvedValue(undefined), onComplete: vi.fn(), onReopen: vi.fn().mockResolvedValue(undefined), onArchive: vi.fn(), onDelete: vi.fn(),
    onCreateStep: vi.fn().mockResolvedValue(undefined), onUpdateStep: vi.fn().mockResolvedValue(undefined),
    onReorderSteps: vi.fn().mockResolvedValue(undefined), onDeleteStep: vi.fn().mockResolvedValue(undefined),
    onLoadRadar: vi.fn().mockResolvedValue(undefined), onCreateRestriction: vi.fn().mockResolvedValue(undefined),
    onUpdateRestriction: vi.fn().mockResolvedValue(undefined), onDeleteRestriction: vi.fn().mockResolvedValue(undefined),
    onFollowup: vi.fn().mockResolvedValue(undefined), onClearWaiting: vi.fn().mockResolvedValue(undefined),
    onOpenHistory: vi.fn().mockResolvedValue(undefined), onRetryDetail: vi.fn().mockResolvedValue(undefined)
  };
}

describe('TaskDetailPanel', () => {
  it('puts execution clarity before steps and properties', () => {
    render(<MemoryRouter><TaskDetailPanel {...props()} /></MemoryRouter>);
    const clarity = screen.getByRole('heading', { name: /clareza de execução/i });
    const steps = screen.getByRole('heading', { name: 'Etapas' });
    const properties = screen.getByRole('button', { name: /propriedades/i });
    expect(clarity.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(steps.compareDocumentPosition(properties) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps Today as an independent action', () => {
    const callbacks = props();
    render(<MemoryRouter><TaskDetailPanel {...callbacks} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Planejar para Hoje' }));
    expect(callbacks.onPlanToday).toHaveBeenCalled();
    expect(callbacks.onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'hoje' }));
  });
});
