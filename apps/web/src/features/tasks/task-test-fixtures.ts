import type { TaskBacklogItem } from '../../api';

export function taskFixture(patch: Partial<TaskBacklogItem> = {}): TaskBacklogItem {
  return {
    id: 'task-1',
    title: 'Preparar proposta',
    status: 'backlog',
    priority: 3,
    workspaceId: 'workspace-1',
    workspace: { id: 'workspace-1', name: 'Prymeira', type: 'empresa' },
    projectId: null,
    project: null,
    horizon: 'active',
    nextStep: 'Enviar rascunho',
    definitionOfDone: 'Proposta aprovada',
    dueDate: null,
    updatedAt: '2026-08-08T10:00:00.000Z',
    todayEntryId: null,
    stepSummary: { total: 0, completed: 0 },
    openRestrictionCount: 0,
    restrictions: [],
    ...patch
  };
}
