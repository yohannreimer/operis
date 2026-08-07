import type { ProjectCockpit } from './types';

export const cockpitFixture: ProjectCockpit = {
  id: 'p1', title: 'Pipeline Q3', description: null, objective: 'Fechar R$ 50 mil',
  workspace: { id: 'w1', name: 'Prymeira Digital', type: 'empresa', color: '#f97316' },
  intentLabel: 'Vender', methodLabel: 'Pipeline', persistedStatus: 'ativo', operationalState: 'stalled',
  timeHorizonEnd: null, progress: { kind: 'phase', value: 'pipeline', label: '4 oportunidades' },
  primaryBlocker: null,
  activeMove: { id: 'm1', projectId: 'p1', taskId: null, text: 'Retomar Empresa Alfa', reason: 'Empresa Alfa está há 5 dias sem avançar.', source: 'recommendation', status: 'active' },
  recommendation: null,
  engine: { key: 'pipeline', methodology: 'pipeline', data: { stages: [], deals: [] }, recovered: false },
  tasks: [1, 2, 3, 4].map((item) => ({ id: `t${item}`, title: `Tarefa ${item}`, status: 'backlog', priority: 3, workspaceId: 'w1', projectId: 'p1' }))
};
