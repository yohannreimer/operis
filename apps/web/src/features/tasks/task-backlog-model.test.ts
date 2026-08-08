import { describe, expect, it } from 'vitest';

import {
  applyTaskView,
  filterTasks,
  groupTasks,
  parseTaskSearchParams,
  sortTasks,
  taskMovement
} from './task-backlog-model';
import { taskFixture } from './task-test-fixtures';
import { DEFAULT_TASK_FILTERS } from './types';

describe('task backlog model', () => {
  it.each([
    [{ status: 'andamento' as const }, 'in_progress'],
    [{ status: 'backlog' as const }, 'next'],
    [{ status: 'hoje' as const }, 'next'],
    [{ status: 'andamento' as const, horizon: 'future' as const }, 'future'],
    [{ status: 'andamento' as const, waitingOnPerson: 'Cliente' }, 'waiting']
  ])('projects task movement with precedence', (patch, expected) => {
    expect(taskMovement(taskFixture(patch))).toBe(expected);
  });

  it('keeps completed and archived work outside operational groups', () => {
    expect(taskMovement(taskFixture({ status: 'feito' }))).toBeNull();
    expect(taskMovement(taskFixture({ status: 'arquivado' }))).toBeNull();
  });

  it('derives actionable views without creating states', () => {
    const tasks = [
      taskFixture({ id: 'waiting', waitingOnPerson: 'Cliente' }),
      taskFixture({ id: 'blocked', openRestrictionCount: 1 }),
      taskFixture({ id: 'late', dueDate: '2026-08-07T12:00:00.000Z' }),
      taskFixture({ id: 'directionless', nextStep: null })
    ];
    expect(applyTaskView(tasks, 'waiting', '2026-08-08').map((item) => item.id)).toEqual(['waiting']);
    expect(applyTaskView(tasks, 'blocked', '2026-08-08').map((item) => item.id)).toEqual(['blocked']);
    expect(applyTaskView(tasks, 'overdue', '2026-08-08').map((item) => item.id)).toEqual(['late']);
    expect(applyTaskView(tasks, 'no_next_step', '2026-08-08').map((item) => item.id)).toEqual(['directionless']);
  });

  it('searches clarity and context while combining filters', () => {
    const project = { id: 'project-1', title: 'Lançamento', workspaceId: 'workspace-1' };
    const tasks = [taskFixture({ projectId: project.id, project, todayEntryId: 'daily-1' })];
    const result = filterTasks(tasks, {
      ...DEFAULT_TASK_FILTERS,
      query: 'rascunho prymeira',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      today: true
    }, '2026-08-08');
    expect(result).toHaveLength(1);
  });

  it('sorts attention before priority and due date deterministically', () => {
    const result = sortTasks([
      taskFixture({ id: 'normal', title: 'Normal', priority: 5 }),
      taskFixture({ id: 'blocked', title: 'Bloqueada', priority: 1, openRestrictionCount: 1 }),
      taskFixture({ id: 'late', title: 'Atrasada', priority: 1, dueDate: '2026-08-07T12:00:00.000Z' })
    ], 'default', '2026-08-08');
    expect(result.map((item) => item.id)).toEqual(['late', 'blocked', 'normal']);
  });

  it('creates each task in only one ordered movement group', () => {
    const groups = groupTasks([
      taskFixture({ id: 'one', status: 'andamento', waitingOnPerson: 'Cliente' }),
      taskFixture({ id: 'two', horizon: 'future' })
    ]);
    expect(groups.map((group) => group.id)).toEqual(['in_progress', 'next', 'waiting', 'future']);
    expect(groups.flatMap((group) => group.tasks).map((task) => task.id).sort()).toEqual(['one', 'two']);
  });

  it('ignores invalid URL values', () => {
    const parsed = parseTaskSearchParams(new URLSearchParams('view=chart&priority=9&due=forever&today=x'));
    expect(parsed).toEqual(DEFAULT_TASK_FILTERS);
  });
});
