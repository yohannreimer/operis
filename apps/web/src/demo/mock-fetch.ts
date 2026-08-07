// src/demo/mock-fetch.ts
// Intercepts window.fetch and returns mock data for all API routes.
// Installed before React mounts when VITE_DEMO_MODE=true.

import type { TodayEntry } from '../features/today/types';
import type { ProjectCockpit, Responsibility } from '../features/projects/types';
import type { Note, NoteFolder } from '../api';
import type { NoteArtifact } from '../features/notes/types';

const localNow = new Date();
const today = [localNow.getFullYear(), String(localNow.getMonth() + 1).padStart(2, '0'), String(localNow.getDate()).padStart(2, '0')].join('-');
const localYesterday = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate() - 1);
const yesterday = [localYesterday.getFullYear(), String(localYesterday.getMonth() + 1).padStart(2, '0'), String(localYesterday.getDate()).padStart(2, '0')].join('-');

// ─── Shared entities ──────────────────────────────────────────────────────────

const WS_NEGOCIOS = { id: 'ws-1', name: 'Negócios', type: 'empresa', color: '#f97316', mode: 'expansao' } as const;
const WS_VIDA = { id: 'ws-2', name: 'Vida', type: 'vida', color: '#818cf8', mode: 'manutencao' } as const;
const WS_CRIACAO = { id: 'ws-3', name: 'Criação', type: 'autoridade', color: '#38bdf8', mode: 'manutencao' } as const;

const PROJECT_LANCAMENTO = {
  id: 'proj-1', title: 'Lançamento Produto Q3', description: 'Lançamento do novo módulo de relatórios',
  status: 'ativo', type: 'construcao', methodology: 'pipeline',
  objective: 'Chegar a R$50k MRR até setembro', workspaceId: 'ws-1', workspace: WS_NEGOCIOS,
  resultStartValue: 0, resultCurrentValue: 32, resultTargetValue: 50,
  methodologyData: {
    stages: [
      { id: 's1', label: 'Lead', order: 1 },
      { id: 's2', label: 'Qualificado', order: 2 },
      { id: 's3', label: 'Proposta', order: 3 },
      { id: 's4', label: 'Fechado', order: 4 },
    ],
    deals: [
      { id: 'd1', name: 'Empresa Alfa', stageId: 's3', amount: 8500, probability: 70, createdAt: yesterday },
      { id: 'd2', name: 'Tech Solutions', stageId: 's2', amount: 12000, probability: 40, createdAt: yesterday },
      { id: 'd3', name: 'Grupo Meridian', stageId: 's4', amount: 6000, probability: 100, createdAt: yesterday },
      { id: 'd4', name: 'StartupBR', stageId: 's1', amount: 3200, probability: 20, createdAt: today },
    ],
    currency: 'BRL', totalGoal: 50000,
  },
};

const PROJECT_CONTEUDO = {
  id: 'proj-2', title: 'Autoridade Digital', description: 'Construção de presença e autoridade no nicho',
  status: 'ativo', type: 'crescimento', methodology: 'okr',
  objective: 'Ser referência no nicho de produtividade executiva', workspaceId: 'ws-1', workspace: WS_NEGOCIOS,
  methodologyData: {
    krs: [
      { id: 'kr1', description: 'Seguidores LinkedIn', currentValue: 4800, targetValue: 10000, unit: 'pessoas', confidence: 'media', order: 1 },
      { id: 'kr2', description: 'Artigos publicados', currentValue: 8, targetValue: 24, unit: 'artigos', confidence: 'alta', order: 2 },
      { id: 'kr3', description: 'Newsletter subscribers', currentValue: 1200, targetValue: 3000, unit: 'assinantes', confidence: 'media', order: 3 },
    ],
    okrPeriod: '2026-Q3',
  },
};

const PROJECT_SAUDE = {
  id: 'proj-3', title: 'Protocolo de Alta Performance', description: 'Rotina de saúde e bem-estar para máxima energia',
  status: 'ativo', type: 'operacao', methodology: 'entrega',
  objective: 'Atingir nível de energia e foco sustentáveis', workspaceId: 'ws-2', workspace: WS_VIDA,
  methodologyData: {
    milestones: [
      { id: 'm1', title: 'Eliminar açúcar processado por 30 dias', done: true, doneAt: yesterday, order: 1 },
      { id: 'm2', title: 'Estabelecer rotina de sono 23h-7h', done: true, doneAt: yesterday, order: 2 },
      { id: 'm3', title: 'Treino 5x/semana por 60 dias consecutivos', done: false, order: 3 },
      { id: 'm4', title: 'Exames de check-up completos', done: false, order: 4 },
    ],
  },
};

const TASKS = [
  { id: 't-1', title: 'Finalizar proposta Empresa Alfa', status: 'hoje', taskType: 'a', energyLevel: 'alta', priority: 1, estimatedMinutes: 90, workspaceId: 'ws-1', projectId: 'proj-1', workspace: WS_NEGOCIOS, project: PROJECT_LANCAMENTO },
  { id: 't-2', title: 'Revisar copy da landing page', status: 'hoje', taskType: 'a', energyLevel: 'alta', priority: 2, estimatedMinutes: 60, workspaceId: 'ws-1', projectId: 'proj-2', workspace: WS_NEGOCIOS, project: PROJECT_CONTEUDO },
  { id: 't-3', title: 'Gravar vídeo para LinkedIn — tema foco', status: 'hoje', taskType: 'b', energyLevel: 'media', priority: 3, estimatedMinutes: 45, workspaceId: 'ws-1', projectId: 'proj-2', workspace: WS_NEGOCIOS, project: PROJECT_CONTEUDO },
  { id: 't-4', title: 'Responder emails críticos da semana', status: 'hoje', taskType: 'b', energyLevel: 'media', priority: 4, estimatedMinutes: 30, workspaceId: 'ws-1', workspace: WS_NEGOCIOS },
  { id: 't-5', title: 'Preparar apresentação Q3 para investidores', status: 'backlog', taskType: 'a', energyLevel: 'alta', priority: 5, estimatedMinutes: 120, dueDate: today, workspaceId: 'ws-1', projectId: 'proj-1', workspace: WS_NEGOCIOS, project: PROJECT_LANCAMENTO },
  { id: 't-6', title: 'Definir estratégia de conteúdo para agosto', status: 'backlog', taskType: 'a', energyLevel: 'alta', priority: 6, estimatedMinutes: 90, workspaceId: 'ws-1', projectId: 'proj-2', workspace: WS_NEGOCIOS, project: PROJECT_CONTEUDO },
  { id: 't-7', title: 'Agendar consulta médica de rotina', status: 'backlog', taskType: 'b', energyLevel: 'baixa', priority: 7, estimatedMinutes: 15, workspaceId: 'ws-2', workspace: WS_VIDA },
  { id: 't-8', title: 'Revisar pipeline de vendas com time', status: 'backlog', taskType: 'a', energyLevel: 'alta', priority: 8, estimatedMinutes: 60, workspaceId: 'ws-1', projectId: 'proj-1', workspace: WS_NEGOCIOS, project: PROJECT_LANCAMENTO },
];

let DEMO_RESPONSIBILITIES: Responsibility[] = [
  {
    id: 'resp-1', workspaceId: 'ws-1', title: 'Saúde do caixa',
    expectedStandard: 'Fluxo de caixa revisado e 90 dias de runway preservados.',
    cadence: 'weekly', health: 'attention', nextCare: 'Reconciliar recebimentos em atraso',
    nextReviewAt: new Date(`${today}T12:00:00`).toISOString(), lastReviewedAt: new Date(`${yesterday}T12:00:00`).toISOString(),
    status: 'active', createdAt: new Date(`${yesterday}T09:00:00`).toISOString(), updatedAt: new Date().toISOString()
  },
  {
    id: 'resp-2', workspaceId: 'ws-1', title: 'Relacionamento com clientes',
    expectedStandard: 'Clientes críticos recebem retorno em até um dia útil.',
    cadence: 'weekly', health: 'healthy', nextCare: 'Revisar sinais de risco nas contas ativas',
    nextReviewAt: new Date(`${today}T15:00:00`).toISOString(), lastReviewedAt: new Date(`${yesterday}T15:00:00`).toISOString(),
    status: 'active', createdAt: new Date(`${yesterday}T09:00:00`).toISOString(), updatedAt: new Date().toISOString()
  },
  {
    id: 'resp-3', workspaceId: 'ws-2', title: 'Recuperação física',
    expectedStandard: 'Sono estável e pelo menos quatro treinos por semana.',
    cadence: 'weekly', health: 'healthy', nextCare: 'Planejar os treinos da próxima semana',
    nextReviewAt: new Date(`${today}T18:00:00`).toISOString(), lastReviewedAt: new Date(`${yesterday}T18:00:00`).toISOString(),
    status: 'active', createdAt: new Date(`${yesterday}T09:00:00`).toISOString(), updatedAt: new Date().toISOString()
  }
];

let DEMO_PROJECT_COCKPITS: ProjectCockpit[] = [
  {
    id: 'proj-1', title: PROJECT_LANCAMENTO.title, description: PROJECT_LANCAMENTO.description,
    objective: PROJECT_LANCAMENTO.objective, workspace: WS_NEGOCIOS, intentLabel: 'Gerar receita', methodLabel: 'Pipeline',
    persistedStatus: 'ativo', operationalState: 'moving', timeHorizonEnd: '2026-09-30',
    primaryMetric: 'MRR', resultStartValue: 0, resultCurrentValue: 32000, resultTargetValue: 50000,
    progress: { kind: 'percent', value: 64, label: 'R$ 32k de R$ 50k' }, primaryBlocker: null,
    activeMove: { id: 'move-1', projectId: 'proj-1', text: 'Fechar proposta Empresa Alfa', source: 'manual', status: 'active', createdAt: new Date().toISOString() },
    recommendation: null,
    engine: { key: 'pipeline', methodology: 'pipeline', data: PROJECT_LANCAMENTO.methodologyData, recovered: false },
    tasks: TASKS.filter((task) => task.projectId === 'proj-1') as ProjectCockpit['tasks']
  },
  {
    id: 'proj-2', title: PROJECT_CONTEUDO.title, description: PROJECT_CONTEUDO.description,
    objective: PROJECT_CONTEUDO.objective, workspace: WS_NEGOCIOS, intentLabel: 'Atingir uma meta', methodLabel: 'OKR',
    persistedStatus: 'ativo', operationalState: 'at_risk', timeHorizonEnd: '2026-10-01',
    progress: { kind: 'percent', value: 43, label: '43% dos resultados-chave' }, primaryBlocker: 'Cadência editorial abaixo do necessário', activeMove: null,
    recommendation: { ruleKey: 'okr-confidence', text: 'Replanejar o KR de artigos', reason: 'A confiança caiu e o ciclo está entrando na segunda metade.', severity: 'attention' },
    engine: { key: 'okr', methodology: 'okr', data: PROJECT_CONTEUDO.methodologyData as ProjectCockpit['engine']['data'], recovered: false },
    tasks: TASKS.filter((task) => task.projectId === 'proj-2') as ProjectCockpit['tasks']
  },
  {
    id: 'proj-3', title: PROJECT_SAUDE.title, description: PROJECT_SAUDE.description,
    objective: PROJECT_SAUDE.objective, workspace: WS_VIDA, intentLabel: 'Entregar algo', methodLabel: 'Marcos',
    persistedStatus: 'ativo', operationalState: 'stalled', timeHorizonEnd: null,
    progress: { kind: 'percent', value: 50, label: '2 de 4 marcos' }, primaryBlocker: null, activeMove: null,
    recommendation: { ruleKey: 'stalled', text: 'Escolher o próximo marco', reason: 'Este Projeto está sem movimento ativo.', severity: 'critical' },
    engine: { key: 'milestone', methodology: 'entrega', data: PROJECT_SAUDE.methodologyData, recovered: false },
    tasks: []
  }
];

const INITIAL_DEMO_NOTE_FOLDERS: NoteFolder[] = [
  {
    id: 'note-folder-sales',
    name: 'Vendas',
    color: '#f07a32',
    parentId: null,
    sortOrder: 0,
    createdAt: new Date(`${yesterday}T09:00:00`).toISOString(),
    updatedAt: new Date(`${today}T09:00:00`).toISOString(),
    archivedAt: null
  },
  {
    id: 'note-folder-product',
    name: 'Produto',
    color: '#62a8ff',
    parentId: null,
    sortOrder: 1,
    createdAt: new Date(`${yesterday}T09:00:00`).toISOString(),
    updatedAt: new Date(`${today}T09:00:00`).toISOString(),
    archivedAt: null
  },
  {
    id: 'note-folder-reference',
    name: 'Referências',
    color: '#9a83ff',
    parentId: null,
    sortOrder: 2,
    createdAt: new Date(`${yesterday}T09:00:00`).toISOString(),
    updatedAt: new Date(`${today}T09:00:00`).toISOString(),
    archivedAt: null
  }
];

const SAMPLE_NOTE_ID = 'note-meeting-sales';
const INITIAL_DEMO_NOTES: Note[] = [
  {
    id: SAMPLE_NOTE_ID,
    title: 'Reunião — funil de vendas',
    content: 'Decisões e próximos passos da reunião comercial.',
    contentBlocks: [
      { id: 'block-heading', type: 'heading', props: { level: 2 }, content: 'Decisões' },
      {
        id: 'block-paragraph',
        type: 'paragraph',
        content: 'O gargalo atual está entre proposta enviada e negociação.'
      },
      {
        id: 'block-diagram',
        type: 'operisArtifact',
        props: {
          artifactId: 'artifact-sales-diagram',
          artifactKind: 'diagram',
          title: 'Fluxo comercial'
        },
        content: []
      },
      {
        id: 'block-whiteboard',
        type: 'operisArtifact',
        props: {
          artifactId: 'artifact-sales-whiteboard',
          artifactKind: 'whiteboard',
          title: 'Hipóteses da reunião'
        },
        content: []
      }
    ],
    contentText: 'Decisões. O gargalo atual está entre proposta enviada e negociação.',
    contentHtml: '<h2>Decisões</h2><p>O gargalo atual está entre proposta enviada e negociação.</p>',
    contentVersion: 1,
    editVersion: 1,
    type: 'geral',
    tags: ['vendas', 'reunião'],
    pinned: true,
    folderId: 'note-folder-sales',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    taskId: null,
    createdAt: new Date(`${yesterday}T10:00:00`).toISOString(),
    updatedAt: new Date(`${today}T10:30:00`).toISOString(),
    archivedAt: null,
    folder: INITIAL_DEMO_NOTE_FOLDERS[0],
    workspace: WS_NEGOCIOS,
    project: null,
    task: null
  }
];

const INITIAL_DEMO_NOTE_ARTIFACTS: NoteArtifact[] = [
  {
    id: 'artifact-sales-diagram',
    noteId: SAMPLE_NOTE_ID,
    kind: 'diagram',
    title: 'Fluxo comercial',
    data: {
      nodes: [
        { id: 'lead', label: 'Lead' },
        { id: 'proposal', label: 'Proposta' },
        { id: 'closed', label: 'Fechado' }
      ],
      edges: [
        { id: 'lead-proposal', source: 'lead', target: 'proposal' },
        { id: 'proposal-closed', source: 'proposal', target: 'closed' }
      ]
    },
    editVersion: 1,
    createdAt: new Date(`${yesterday}T10:15:00`).toISOString(),
    updatedAt: new Date(`${today}T10:30:00`).toISOString()
  },
  {
    id: 'artifact-sales-whiteboard',
    noteId: SAMPLE_NOTE_ID,
    kind: 'whiteboard',
    title: 'Hipóteses da reunião',
    data: { elements: [], appState: { viewBackgroundColor: '#171719' }, files: {} },
    editVersion: 1,
    createdAt: new Date(`${yesterday}T10:25:00`).toISOString(),
    updatedAt: new Date(`${today}T10:30:00`).toISOString()
  }
];

function cloneDemoValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

let DEMO_NOTES = cloneDemoValue(INITIAL_DEMO_NOTES);
let DEMO_NOTE_ARTIFACTS = cloneDemoValue(INITIAL_DEMO_NOTE_ARTIFACTS);
let DEMO_NOTE_FOLDERS = cloneDemoValue(INITIAL_DEMO_NOTE_FOLDERS);

function frontOverview(workspaceId: string) {
  const workspace = [WS_NEGOCIOS, WS_VIDA, WS_CRIACAO].find((item) => item.id === workspaceId);
  if (!workspace) return null;
  const projects = DEMO_PROJECT_COCKPITS.filter((project) => project.workspace.id === workspaceId);
  const responsibilities = DEMO_RESPONSIBILITIES.filter((item) => item.workspaceId === workspaceId);
  const projectAttention = projects.find((project) => project.recommendation);
  const responsibilityAttention = responsibilities.find((item) => item.health !== 'healthy');
  const attention = projectAttention
    ? { kind: 'project' as const, sourceId: projectAttention.id, severity: projectAttention.recommendation?.severity === 'critical' ? 'critical' as const : 'attention' as const, title: projectAttention.title, reason: projectAttention.recommendation?.reason ?? 'Este Projeto pede atenção.' }
    : responsibilityAttention
      ? { kind: 'responsibility' as const, sourceId: responsibilityAttention.id, severity: responsibilityAttention.health === 'critical' ? 'critical' as const : 'attention' as const, title: responsibilityAttention.title, reason: responsibilityAttention.nextCare }
      : null;
  return {
    ...workspace,
    health: attention?.severity ?? 'normal',
    attention,
    activeProjects: projects.filter((project) => project.persistedStatus === 'ativo').length,
    projects: projects.filter((project) => project.persistedStatus === 'ativo'),
    pausedProjects: projects.filter((project) => project.persistedStatus === 'pausado'),
    responsibilities,
    capacity: {
      activeProjects: projects.filter((project) => project.persistedStatus === 'ativo').length,
      todayTasks: TASKS.filter((task) => task.workspaceId === workspaceId && task.status === 'hoje').length
    }
  };
}

function makeIso(date: string, h: number, m = 0) {
  return new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
}

function instantDateKey(value: string) {
  const date = new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

type DemoDayPlanItem = {
  id: string;
  dayPlanId: string;
  taskId: string | null;
  inboxItemId: string | null;
  startTime: string;
  endTime: string;
  completedAt: string | null;
  orderIndex: number;
  blockType: 'task' | 'fixed';
  confirmationState: 'pending' | 'confirmed_done' | 'confirmed_not_done';
  task: (typeof TASKS)[number] | null;
  inboxItem: null | {
    id: string;
    content: string;
    workspaceId: string | null;
    workspace: typeof WS_NEGOCIOS | typeof WS_VIDA | null;
  };
};

const DAY_PLAN: { id: string; date: string; items: DemoDayPlanItem[] } = {
  id: 'dp-today',
  date: today,
  items: [
    { id: 'dpi-1', dayPlanId: 'dp-today', taskId: 't-1', inboxItemId: null, startTime: makeIso(today, 8), endTime: makeIso(today, 9, 30), completedAt: null, orderIndex: 0, blockType: 'task', confirmationState: 'pending', task: TASKS[0], inboxItem: null },
    { id: 'dpi-2', dayPlanId: 'dp-today', taskId: 't-2', inboxItemId: null, startTime: makeIso(today, 10), endTime: makeIso(today, 11), completedAt: null, orderIndex: 1, blockType: 'task', confirmationState: 'pending', task: TASKS[1], inboxItem: null },
    { id: 'dpi-3', dayPlanId: 'dp-today', taskId: 't-3', inboxItemId: null, startTime: makeIso(today, 11), endTime: makeIso(today, 11, 45), completedAt: null, orderIndex: 2, blockType: 'task', confirmationState: 'pending', task: TASKS[2], inboxItem: null },
    { id: 'dpi-4', dayPlanId: 'dp-today', taskId: null, inboxItemId: null, startTime: makeIso(today, 14), endTime: makeIso(today, 15), completedAt: null, orderIndex: 3, blockType: 'fixed', confirmationState: 'pending', task: null, inboxItem: null },
    { id: 'dpi-5', dayPlanId: 'dp-today', taskId: 't-4', inboxItemId: null, startTime: makeIso(today, 15), endTime: makeIso(today, 15, 30), completedAt: null, orderIndex: 4, blockType: 'task', confirmationState: 'pending', task: TASKS[3], inboxItem: null },
    { id: 'dpi-6', dayPlanId: 'dp-today', taskId: 't-5', inboxItemId: null, startTime: makeIso(today, 16), endTime: makeIso(today, 18), completedAt: null, orderIndex: 5, blockType: 'task', confirmationState: 'pending', task: TASKS[4], inboxItem: null },
  ],
};

const COMMITMENTS = [
  { id: 'c-1', workspaceId: 'ws-1', projectId: null, title: 'Reunião de alinhamento — time', description: null, type: 'fixo', status: 'ativo', startTime: '14:00', durationMin: 60, recurrenceDays: ['seg', 'qua', 'sex'], date: null, recurrenceEnd: null, createdAt: today, updatedAt: today, exceptions: [] },
  { id: 'c-2', workspaceId: 'ws-2', projectId: null, title: 'Treino matinal', description: null, type: 'fixo', status: 'ativo', startTime: '06:30', durationMin: 60, recurrenceDays: ['seg', 'ter', 'qua', 'qui', 'sex'], date: null, recurrenceEnd: null, createdAt: today, updatedAt: today, exceptions: [] },
  { id: 'c-3', workspaceId: 'ws-1', projectId: null, title: 'Review semanal', description: 'Revisão e planejamento da semana', type: 'fixo', status: 'ativo', startTime: '08:00', durationMin: 90, recurrenceDays: ['sex'], date: null, recurrenceEnd: null, createdAt: today, updatedAt: today, exceptions: [] },
];

function buildAgendaWeekFixture(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00.000Z`);
  const recurrenceByDay = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const days = Array.from({ length: 7 }, (_, index) => {
    const value = new Date(start);
    value.setUTCDate(start.getUTCDate() + index);
    const date = value.toISOString().slice(0, 10);
    return {
      date,
      intents: DAILY_EXECUTION_ITEMS.filter((item) => item.date === date),
      blocks: DAY_PLAN.items
        .filter((item) => instantDateKey(item.startTime) === date)
        .flatMap((item) => {
            const kind = item.taskId ? 'task' as const : item.inboxItemId ? 'inbox' as const : null;
            if (!kind) return [];
            const source = kind === 'task' ? item.task : item.inboxItem;
            if (!source) return [];
            return [{
              id: item.id,
              kind,
              sourceId: item.taskId ?? item.inboxItemId!,
              date,
              title: 'title' in source ? source.title : source.content,
              startTime: item.startTime,
              endTime: item.endTime,
              completedAt: item.completedAt,
              workspaceId: source.workspaceId ?? null,
              plannedMinutes: Math.round((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 60_000)
            }];
          }),
      commitments: COMMITMENTS
        .filter((item) => item.recurrenceDays.includes(recurrenceByDay[value.getUTCDay()]))
        .map((item) => ({
          id: `${item.id}:${date}`,
          commitmentId: item.id,
          date,
          title: item.title,
          startTime: item.startTime,
          durationMin: item.durationMin,
          workspaceId: item.workspaceId,
          recurring: true,
          rescheduled: false
        }))
    };
  });
  return {
    weekStart,
    resourceErrors: { commitments: null },
    days,
    unscheduled: {
      tasks: TASKS.filter((item) => item.status === 'backlog').map((item) => ({
        id: item.id,
        title: item.title,
        estimatedMinutes: item.estimatedMinutes,
        plannedMinutes: 0,
        remainingMinutes: item.estimatedMinutes,
        workspaceId: item.workspaceId ?? null,
        workspaceName: item.workspace?.name ?? null,
        workspaceColor: item.workspace?.color ?? null,
        projectName: item.project?.title ?? null
      })),
      inbox: INBOX_ITEMS.map((item) => ({
        id: item.id,
        title: item.content,
        workspaceId: item.workspaceId,
        context: item.workspace?.name ?? null
      }))
    }
  };
}

const HABITS: unknown[] = [
  { id: 'h-1', title: 'Treino', lifeArea: 'corpo', type: 'binary', icon: '💪', color: '#e07c4a', frequencyType: 'daily', frequencyTarget: 1, specificDays: [], unit: null, dailyTarget: null, xpPerCompletion: 20, status: 'ativo', sortOrder: 1, createdAt: yesterday, updatedAt: today },
  { id: 'h-2', title: 'Dormir 7-8h', lifeArea: 'corpo', type: 'binary', icon: '😴', color: '#e07c4a', frequencyType: 'daily', frequencyTarget: 1, specificDays: [], unit: null, dailyTarget: null, xpPerCompletion: 15, status: 'ativo', sortOrder: 2, createdAt: yesterday, updatedAt: today },
  { id: 'h-3', title: 'Meditação 10min', lifeArea: 'mente', type: 'binary', icon: '🧘', color: '#818cf8', frequencyType: 'daily', frequencyTarget: 1, specificDays: [], unit: null, dailyTarget: null, xpPerCompletion: 15, status: 'ativo', sortOrder: 3, createdAt: yesterday, updatedAt: today },
  { id: 'h-4', title: 'Leitura 30min', lifeArea: 'mente', type: 'quantitative', icon: '📚', color: '#818cf8', frequencyType: 'daily', frequencyTarget: 30, specificDays: [], unit: 'min', dailyTarget: 30, xpPerCompletion: 20, status: 'ativo', sortOrder: 4, createdAt: yesterday, updatedAt: today },
  { id: 'h-5', title: 'Deep Work 2h', lifeArea: 'trabalho', type: 'binary', icon: '🎯', color: '#5bb98c', frequencyType: 'daily', frequencyTarget: 1, specificDays: [], unit: null, dailyTarget: null, xpPerCompletion: 30, status: 'ativo', sortOrder: 5, createdAt: yesterday, updatedAt: today },
  { id: 'h-6', title: 'Top 3 entregue', lifeArea: 'trabalho', type: 'binary', icon: '✅', color: '#5bb98c', frequencyType: 'daily', frequencyTarget: 1, specificDays: [], unit: null, dailyTarget: null, xpPerCompletion: 25, status: 'ativo', sortOrder: 6, createdAt: yesterday, updatedAt: today },
  { id: 'h-7', title: 'Ligar para família', lifeArea: 'relacoes', type: 'binary', icon: '❤️', color: '#d46464', frequencyType: 'weekly', frequencyTarget: 2, specificDays: [], unit: null, dailyTarget: null, xpPerCompletion: 20, status: 'ativo', sortOrder: 7, createdAt: yesterday, updatedAt: today },
  { id: 'h-8', title: 'Revisar finanças', lifeArea: 'financas', type: 'binary', icon: '💰', color: '#d4a843', frequencyType: 'weekly', frequencyTarget: 1, specificDays: ['sex'], unit: null, dailyTarget: null, xpPerCompletion: 20, status: 'ativo', sortOrder: 8, createdAt: yesterday, updatedAt: today },
  { id: 'h-9', title: 'Curso ou podcast', lifeArea: 'crescimento', type: 'binary', icon: '🌱', color: '#7dd3fc', frequencyType: 'daily', frequencyTarget: 1, specificDays: [], unit: null, dailyTarget: null, xpPerCompletion: 15, status: 'ativo', sortOrder: 9, createdAt: yesterday, updatedAt: today },
];

const HABIT_TODAY_STATS = HABITS.map((h: any) => ({
  ...h,
  currentLog: ['h-1','h-3','h-4','h-5','h-6','h-9'].includes(h.id)
    ? { id: `log-${h.id}`, habitId: h.id, date: today, value: 1, note: null, createdAt: today }
    : null,
  streak: ({ 'h-1': 14, 'h-2': 7, 'h-3': 21, 'h-4': 28, 'h-5': 9, 'h-6': 12, 'h-7': 4, 'h-8': 8, 'h-9': 6 } as Record<string, number>)[h.id] ?? 0,
  periodProgress: { done: 1, target: (h as any).frequencyTarget },
  isCompletedToday: ['h-1','h-3','h-4','h-5','h-6','h-9'].includes(h.id),
  isScheduledForDate: h.id !== 'h-8',
}));

const HABIT_EVOLUTION = {
  startDate: yesterday,
  endDate: today,
  expectedOccurrences: 90,
  completedOccurrences: 66,
  rhythmPct: 73,
  areas: [
    { lifeArea: 'corpo', level: 4, name: 'Atleta', totalXp: 840, progressPct: 68, nextLevelXp: 1200 },
    { lifeArea: 'mente', level: 5, name: 'Filósofo', totalXp: 1450, progressPct: 45, nextLevelXp: 2000 },
    { lifeArea: 'trabalho', level: 5, name: 'Executor', totalXp: 1620, progressPct: 81, nextLevelXp: 2000 },
    { lifeArea: 'relacoes', level: 2, name: 'Conectado', totalXp: 320, progressPct: 32, nextLevelXp: 500 },
    { lifeArea: 'financas', level: 3, name: 'Consciente', totalXp: 580, progressPct: 58, nextLevelXp: 800 },
    { lifeArea: 'crescimento', level: 3, name: 'Aprendiz', totalXp: 490, progressPct: 49, nextLevelXp: 800 },
  ]
};

const HABIT_HEATMAP_LOGS = Array.from({ length: 90 }, (_, index) => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (89 - index));
  const dateKey = date.toISOString().slice(0, 10);
  return index % 4 === 0 ? null : {
    id: `demo-habit-log-${index}`,
    habitId: 'h-1',
    date: dateKey,
    value: 1,
    note: null,
    createdAt: dateKey,
  };
}).filter(Boolean);

const HABIT_RADAR: Record<string, unknown> = {
  corpo:       { level: 4, name: 'Atleta', totalXp: 840, progressPct: 68, nextLevelXp: 1200 },
  mente:       { level: 5, name: 'Filósofo', totalXp: 1450, progressPct: 45, nextLevelXp: 2000 },
  trabalho:    { level: 5, name: 'Executor', totalXp: 1620, progressPct: 81, nextLevelXp: 2000 },
  relacoes:    { level: 2, name: 'Conectado', totalXp: 320, progressPct: 32, nextLevelXp: 500 },
  financas:    { level: 3, name: 'Consciente', totalXp: 580, progressPct: 58, nextLevelXp: 800 },
  crescimento: { level: 3, name: 'Aprendiz', totalXp: 490, progressPct: 49, nextLevelXp: 800 },
};

const GAMIFICATION_DETAILS = {
  scoreAtual: 847,
  scoreSemanal: 142,
  streak: 21,
  dividaExecucao: 2,
  atualizadoEm: today,
  streakExecucaoA: 12,
  streakDeepWork: 9,
  history: [
    { weekStart: '2026-04-21', label: '21/04', completed: 12, delayed: 2, failed: 1, score: 118 },
    { weekStart: '2026-04-28', label: '28/04', completed: 15, delayed: 1, failed: 0, score: 135 },
    { weekStart: '2026-05-05', label: '05/05', completed: 11, delayed: 3, failed: 2, score: 102 },
    { weekStart: '2026-05-12', label: '12/05', completed: 16, delayed: 0, failed: 1, score: 148 },
    { weekStart: '2026-05-19', label: '19/05', completed: 14, delayed: 1, failed: 0, score: 142 },
  ],
  today: { completed: 3, delayed: 0, failed: 0, pendingConfirmations: 2 },
  commitmentBreaks: [],
};

const EXECUTION_BRIEFING = {
  date: today,
  top3: [TASKS[0], TASKS[1], TASKS[4]],
  top3Meta: { locked: true, manual: false, committedAt: today, note: null, taskIds: ['t-1','t-2','t-5'], guidedSwapNeeded: false, missingSlots: 0, droppedTaskIds: [], swapTaskIds: [], swapReason: null },
  pendingA: 5,
  strictModeBlocked: false,
  openCounts: { a: 5, b: 6, c: 3 },
  capacity: { baseMinutes: 480, fixedMinutes: 60, availableMinutes: 420, plannedTaskMinutes: 345, overloadMinutes: 0, isUnrealistic: false },
  alerts: { expansionNeedsA: false, expansionNeedsDeepWork: false, fragmentationRisk: false, fragmentationCount: 0, focusOverloadRisk: false, focusOverloadCount: 0, excessiveRescheduleA: 0, vagueTasks: 1, maintenanceConstructionRisk: false, maintenanceConstructionCount: 0, standbyExecutionRisk: false, standbyExecutionCount: 0 },
  actionables: { fragmentationProjects: [], disconnectedTasks: [], rescheduleRiskTasks: [], ghostProjects: [], waitingFollowups: [] },
};

const EXECUTION_SCORE = {
  date: today,
  score: 88,
  workspaceId: null,
  components: {
    aCompletion: { weight: 0.4, value: 100, completed: 5, total: 5 },
    deepWork: { weight: 0.2, value: 90, minutes: 270, targetMinutes: 300 },
    punctuality: { weight: 0.15, value: 82, onTime: 9, total: 11 },
    nonReschedule: { weight: 0.15, value: 76, delayed: 2, total: 8 },
    projectConnection: { weight: 0.1, value: 88, connected: 7, total: 8 },
  },
};

const WEEKLY_PULSE = {
  weekStart: '2026-05-19',
  weekEnd: '2026-05-25',
  days: [
    { date: '2026-05-19', plannedMinutes: 390, fixedMinutes: 60, deepWorkMinutes: 120, constructionMinutes: 240, operationMinutes: 90, disconnectedMinutes: 60 },
    { date: '2026-05-20', plannedMinutes: 420, fixedMinutes: 45, deepWorkMinutes: 90, constructionMinutes: 210, operationMinutes: 120, disconnectedMinutes: 45 },
    { date: '2026-05-21', plannedMinutes: 360, fixedMinutes: 30, deepWorkMinutes: 60, constructionMinutes: 180, operationMinutes: 120, disconnectedMinutes: 30 },
    { date: '2026-05-22', plannedMinutes: 405, fixedMinutes: 45, deepWorkMinutes: 90, constructionMinutes: 225, operationMinutes: 105, disconnectedMinutes: 30 },
    { date: '2026-05-23', plannedMinutes: 300, fixedMinutes: 30, deepWorkMinutes: 45, constructionMinutes: 120, operationMinutes: 120, disconnectedMinutes: 30 },
  ],
  workspaceHours: [
    { workspaceId: 'ws-1', name: 'Negócios', minutes: 1260, hours: 21 },
    { workspaceId: 'ws-2', name: 'Vida', minutes: 330, hours: 5.5 },
  ],
  workspaceHeatmap: [
    {
      workspaceId: 'ws-1',
      name: 'Negócios',
      totalMinutes: 1260,
      totalHours: 21,
      days: [
        { date: '2026-05-19', minutes: 300, hours: 5 },
        { date: '2026-05-20', minutes: 270, hours: 4.5 },
        { date: '2026-05-21', minutes: 210, hours: 3.5 },
        { date: '2026-05-22', minutes: 285, hours: 4.75 },
        { date: '2026-05-23', minutes: 195, hours: 3.25 },
      ],
    },
    {
      workspaceId: 'ws-2',
      name: 'Vida',
      totalMinutes: 330,
      totalHours: 5.5,
      days: [
        { date: '2026-05-19', minutes: 90, hours: 1.5 },
        { date: '2026-05-20', minutes: 75, hours: 1.25 },
        { date: '2026-05-21', minutes: 60, hours: 1 },
        { date: '2026-05-22', minutes: 45, hours: 0.75 },
        { date: '2026-05-23', minutes: 60, hours: 1 },
      ],
    },
  ],
  composition: {
    constructionPercent: 62,
    operationPercent: 28,
    disconnectedPercent: 10,
  },
};

const WEEKLY_ALLOCATION = {
  weekStart: '2026-05-19',
  weekEnd: '2026-05-25',
  rows: [
    { workspaceId: 'ws-1', workspaceName: 'Negócios', workspaceColor: '#f97316', workspaceMode: 'expansao', plannedPercent: 80, actualPercent: 70, deltaPercent: -10, actualHours: 28 },
    { workspaceId: 'ws-2', workspaceName: 'Vida', workspaceColor: '#818cf8', workspaceMode: 'manutencao', plannedPercent: 20, actualPercent: 17.5, deltaPercent: -2.5, actualHours: 7 },
  ],
  totals: { plannedPercent: 100, actualHours: 35, disconnectedPercent: 12.5 },
};

const WEEKLY_REVIEW = {
  weekStart: '2026-05-19',
  weekEnd: '2026-05-25',
  summary: {
    completedA: 5,
    deepWorkMinutes: 405,
    deepWorkHours: 6.75,
    dominantWorkspace: WEEKLY_ALLOCATION.rows[0],
    neglectedWorkspace: WEEKLY_ALLOCATION.rows[1],
    ghostProjectsCount: 0,
    ghostProjects: [],
    ghostFrontsCount: 0,
    ghostFronts: [],
    dominantBottleneck: { key: 'deep_work', label: 'Trabalho profundo', percent: 34 },
  },
  question: 'A semana puxou forte para negócios. O que precisa ser protegido para manter avanço sem sacrificar recuperação?',
  autoDraft: {
    generatedAt: today,
    confidence: 'alta',
    source: 'demo',
    nextPriority: 'Fechar proposta Empresa Alfa e proteger 2 blocos de Deep Work.',
    strategicDecision: 'Manter foco em lançamento Q3; adiar tarefas desconexas até sexta.',
    commitmentLevel: 'alta',
    actionItems: ['Travar agenda de terça e quinta', 'Revisar pipeline antes do fim da semana'],
    reflection: 'Boa tração em construção, com risco moderado de concentração em uma frente.',
    dataUsed: ['Tarefas A concluídas', 'Horas por workspace', 'Pulso semanal'],
  },
};

const INBOX_ITEMS = [
  { id: 'inbox-1', content: 'Verificar preço do novo fornecedor e comparar com atual', source: 'app', status: 'pendente', workspaceId: 'ws-1', inboxContextId: null, position: 1, waitingDate: null, waitingPerson: null, waitingNote: null, scheduledAt: null, convertedTaskId: null, createdAt: today, updatedAt: today, workspace: WS_NEGOCIOS, inboxContext: null },
  { id: 'inbox-2', content: 'Ideia: criar checklist de onboarding para novos clientes', source: 'app', status: 'pendente', workspaceId: 'ws-1', inboxContextId: null, position: 2, waitingDate: null, waitingPerson: null, waitingNote: null, scheduledAt: null, convertedTaskId: null, createdAt: today, updatedAt: today, workspace: WS_NEGOCIOS, inboxContext: null },
  { id: 'inbox-3', content: 'Marcar revisão de contrato com advogado — prazo fim do mês', source: 'whatsapp', status: 'pendente', workspaceId: null, inboxContextId: null, position: 3, waitingDate: null, waitingPerson: null, waitingNote: null, scheduledAt: null, convertedTaskId: null, createdAt: today, updatedAt: today, workspace: null, inboxContext: null },
  { id: 'inbox-4', content: 'Pesquisar ferramentas de automação para follow-up de leads', source: 'app', status: 'pendente', workspaceId: 'ws-1', inboxContextId: null, position: 4, waitingDate: null, waitingPerson: null, waitingNote: null, scheduledAt: null, convertedTaskId: null, createdAt: today, updatedAt: today, workspace: WS_NEGOCIOS, inboxContext: null },
  { id: 'inbox-5', content: 'Protocolo de respiração box breathing — testar antes do trabalho profundo', source: 'app', status: 'pendente', workspaceId: 'ws-2', inboxContextId: null, position: 5, waitingDate: null, waitingPerson: null, waitingNote: null, scheduledAt: null, convertedTaskId: null, createdAt: yesterday, updatedAt: today, workspace: WS_VIDA, inboxContext: null },
];

let DAILY_EXECUTION_ITEMS: TodayEntry[] = [
  { id: 'daily-1', kind: 'task', sourceId: 't-1', date: today, title: 'Finalizar proposta Empresa Alfa', position: 0, completedAt: null, project: 'Lançamento Produto Q3', estimatedMinutes: 90, deadline: null },
  { id: 'daily-2', kind: 'inbox', sourceId: 'inbox-2', date: today, title: 'Ideia: criar checklist de onboarding para novos clientes', position: 1, completedAt: null, context: 'Negócios' },
  { id: 'daily-3', kind: 'task', sourceId: 't-2', date: today, title: 'Revisar copy da landing page', position: 2, completedAt: null, project: 'Autoridade Digital', estimatedMinutes: 60, deadline: null },
  { id: 'daily-4', kind: 'inbox', sourceId: 'inbox-5', date: today, title: 'Testar box breathing antes do trabalho profundo', position: 3, completedAt: new Date().toISOString(), context: 'Vida' },
];

let DAILY_EXECUTION_ROLLOVER: TodayEntry[] = [
  { id: 'daily-old-1', kind: 'task', sourceId: 't-8', date: yesterday, title: 'Revisar pipeline de vendas com time', position: 0, completedAt: null, project: 'Lançamento Produto Q3', estimatedMinutes: 60, deadline: null },
];

let ACTIVE_EXECUTION: Record<string, unknown> | null = null;
let NEXT_DAY_PLAN_ITEM_ID = 7;

// ─── Route matcher ────────────────────────────────────────────────────────────

type MockResponse = { status: number; body: unknown };

function matchRoute(url: string): MockResponse | null {
  // strip base URL and query string
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0].replace(/^\/api(?=\/|$)/, '');

  if (path === '/workspaces/overview') {
    return {
      status: 200,
      body: [WS_NEGOCIOS, WS_VIDA, WS_CRIACAO].map((workspace) => {
        const overview = frontOverview(workspace.id)!;
        return {
          id: overview.id, name: overview.name, type: overview.type, mode: overview.mode,
          color: overview.color, health: overview.health, attention: overview.attention,
          activeProjects: overview.activeProjects
        };
      })
    };
  }
  if (path.match(/^\/workspaces\/[^/]+\/overview$/)) {
    const overview = frontOverview(path.split('/')[2]);
    return overview ? { status: 200, body: overview } : { status: 404, body: { message: 'Frente não encontrada.' } };
  }
  if (path.match(/^\/workspaces\/[^/]+\/responsibilities$/)) {
    const workspaceId = path.split('/')[2];
    return { status: 200, body: DEMO_RESPONSIBILITIES.filter((item) => item.workspaceId === workspaceId) };
  }
  if (path.match(/^\/responsibilities\/[^/]+\/reviews$/)) return { status: 200, body: [] };
  if (path === '/project-execution') return { status: 200, body: DEMO_PROJECT_COCKPITS };
  if (path.match(/^\/project-execution\/[^/]+$/)) {
    const cockpit = DEMO_PROJECT_COCKPITS.find((project) => project.id === path.split('/')[2]);
    return cockpit ? { status: 200, body: cockpit } : { status: 404, body: { message: 'Projeto não encontrado.' } };
  }

  if (path === '/workspaces') return { status: 200, body: [WS_NEGOCIOS, WS_VIDA, WS_CRIACAO] };
  if (path === '/projects') return { status: 200, body: [PROJECT_LANCAMENTO, PROJECT_CONTEUDO, PROJECT_SAUDE] };
  if (path.match(/^\/projects\/[^/]+\/scorecard/)) return { status: 200, body: { metrics: [], checkins: [] } };
  if (path.match(/^\/projects\/[^/]+/)) return { status: 200, body: PROJECT_LANCAMENTO };

  if (path === '/tasks') return { status: 200, body: TASKS };
  if (path.match(/^\/tasks\/waiting-radar/)) return { status: 200, body: { rows: [] } };
  if (path.match(/^\/tasks\/[^/]+\/subtasks/)) return { status: 200, body: [] };
  if (path.match(/^\/tasks\/[^/]+\/restrictions/)) return { status: 200, body: [] };
  if (path.match(/^\/tasks\/[^/]+\/history/)) return { status: 200, body: [] };
  if (path.match(/^\/tasks\/[^/]+\/multiblock/)) return { status: 200, body: null };
  if (path.match(/^\/tasks\/[^/]+\/waiting-followup/)) return { status: 200, body: null };

  if (path.match(/^\/day-plans\/\d{4}-\d{2}-\d{2}$/)) {
    const date = path.slice(-10);
    return {
      status: 200,
      body: { ...DAY_PLAN, date, items: DAY_PLAN.items.filter((item) => instantDateKey(item.startTime) === date) }
    };
  }
  if (path.match(/^\/agenda\/week\/\d{4}-\d{2}-\d{2}$/)) {
    return { status: 200, body: buildAgendaWeekFixture(path.slice(-10)) };
  }
  if (path === '/execution-sessions/active') return { status: 200, body: ACTIVE_EXECUTION };
  if (path === '/commitments') return { status: 200, body: COMMITMENTS };
  if (path === '/commitments/week') return { status: 200, body: {} };

  if (path === '/gamification') return { status: 200, body: { scoreAtual: 847, scoreSemanal: 142, streak: 21, dividaExecucao: 2, atualizadoEm: today } };
  if (path === '/gamification/details') return { status: 200, body: GAMIFICATION_DETAILS };

  if (path === '/habits') return { status: 200, body: HABITS };
  if (path === '/habits/stats/today') return { status: 200, body: HABIT_TODAY_STATS };
  if (path === '/habits/stats/evolution') return { status: 200, body: HABIT_EVOLUTION };
  if (path === '/habits/stats/radar') return { status: 200, body: HABIT_RADAR };
  if (path.match(/^\/habits\/stats\/heatmap\/[^/]+$/)) return { status: 200, body: { habitId: path.split('/').at(-1), startDate: HABIT_EVOLUTION.startDate, endDate: today, logs: HABIT_HEATMAP_LOGS } };
  if (path.match(/^\/habits\/[^/]+\/logs/)) return { status: 200, body: [] };

  if (path.match(/^\/execution\/briefing\//)) return { status: 200, body: EXECUTION_BRIEFING };
  if (path.match(/^\/execution\/score\//)) return { status: 200, body: EXECUTION_SCORE };
  if (path === '/execution/evolution') return { status: 200, body: {
    generatedAt: today,
    workspaceId: null,
    windowDays: 30,
    index: 74,
    previousIndex: 68,
    deltaIndex: 6,
    trend: 'subindo',
    stage: {
      code: 'construtor',
      label: 'Construtor',
      minIndex: 60,
      next: { code: 'estrategista', label: 'Estrategista', minIndex: 85 },
    },
    confidence: 0.82,
    systemMode: {
      focusLimit: 3,
      deepWorkTargetMinutes: 120,
      maxNewTasksPerDay: 3,
      strictModeDefault: false,
      allowBCExecutionWhileAPending: false,
      reviewRhythm: 'weekly',
      enforcement: 'Bloqueie novas tarefas B/C enquanto há A pendente.',
      workloadGuard: 'Máximo 5 tarefas/dia. Priorize profundidade.',
    },
    challenge: {
      title: 'Semana sem fragmentação',
      metric: 'deep_work_days',
      target: 4,
      current: 3,
      unit: 'd',
      dueDate: today,
      reason: 'A agenda está saudável, mas ainda concentra construção em poucos blocos.',
    },
    narrative: {
      summary: 'Você está em modo construtor: boa tração em tarefas A, pipeline ativo e risco controlado de dispersão.',
      pressureMessage: 'Proteja os blocos de Deep Work antes de aceitar novas demandas operacionais.',
      riskIfIgnored: 'Se a semana virar só resposta e manutenção, o lançamento Q3 perde cadência comercial.',
      next7DaysPlan: [
        'Fechar proposta Empresa Alfa antes de abrir novas oportunidades.',
        'Reservar dois blocos de 90 minutos para copy e apresentação Q3.',
        'Revisar tarefas desconectadas na sexta e arquivar o que não sustenta frente ativa.',
      ],
    },
    metrics: {
      aCompletionRate: 91,
      deepWorkHoursPerWeek: 6.75,
      rescheduleRate: 8,
      projectConnectionRate: 88,
      constructionPercent: 62,
      disconnectedPercent: 10,
      consistencyPercent: 84,
      ghostProjects: 0,
    },
    promotion: {
      recommended: false,
      blockedBySelfAssessment: false,
      blockReason: null,
      daysConsistent: 9,
      reason: 'Mantenha mais uma semana acima de 85 para avançar para Estrategista.',
    },
    regression: {
      risk: false,
      daysDecline: 0,
      reason: 'Sem sinal de regressão; a queda de energia está dentro do padrão semanal.',
    },
    perceptionAlignment: {
      status: 'alinhado',
      perceivedLevel: 'alto',
      objectiveLevel: 'alto',
      note: 'Sua percepção de execução combina com os sinais objetivos da semana.',
      sourcePeriodStart: '2026-05-19',
    },
    learningLoop: {
      stageStability: 0.74,
      decisionQualityScore: 82,
      commitmentSignal: 'alto',
      decisionsLast90Days: 8,
      selfAssessmentBlock: false,
      weeklyTrajectory: [
        { label: '4 sem.', index: 63 },
        { label: '3 sem.', index: 66 },
        { label: '2 sem.', index: 68 },
        { label: 'Atual', index: 74 },
      ],
    },
    decisionJournal: [
      {
        id: 'decision-1',
        kind: 'review',
        periodType: 'weekly',
        periodStart: '2026-05-19',
        updatedAt: today,
        decision: 'Priorizar lançamento Q3 e reduzir tarefas desconectadas.',
        commitmentLevel: 'alto',
        signal: 'executiva',
        source: 'Revisão semanal',
        eventCode: 'weekly_review',
        impactScore: 8,
      },
    ],
    explainableRules: [
      {
        id: 'rule-a-completion',
        title: 'Conclusão de tarefas A',
        description: 'Tarefas estratégicas concluídas mantêm a semana em modo construtor.',
        metric: 'a_completion_rate',
        operator: 'gte',
        current: 91,
        target: 85,
        unit: '%',
        weight: 30,
        status: 'ok',
        impact: 9,
        dataUsed: 'Tarefas A concluídas na semana',
        recommendation: 'Preserve o top 3 diário antes de responder demandas novas.',
      },
      {
        id: 'rule-disconnected',
        title: 'Baixa dispersão',
        description: 'Poucas horas ficaram sem conexão com frente estratégica.',
        metric: 'disconnected_percent',
        operator: 'lte',
        current: 10,
        target: 20,
        unit: '%',
        weight: 20,
        status: 'ok',
        impact: 6,
        dataUsed: 'Pulso semanal por workspace',
        recommendation: 'Continue classificando inbox antes de transformar em tarefa.',
      },
    ],
    nextActions: [
      'Abrir Hoje e travar o top 3.',
      'Revisar proposta Empresa Alfa.',
      'Eliminar uma tarefa desconectada do backlog.',
    ],
  } };
  if (path === '/execution/weekly-pulse') return { status: 200, body: WEEKLY_PULSE };
  if (path.match(/^\/execution\/top3\//)) return { status: 200, body: { date: today, workspaceId: null, locked: true, manual: false, committedAt: today, note: null, taskIds: ['t-1','t-2','t-5'], tasks: [TASKS[0], TASKS[1], TASKS[4]] } };

  if (path === '/strategy/weekly-allocation' || path === '/weekly-allocation') return { status: 200, body: WEEKLY_ALLOCATION };
  if (path === '/strategy/weekly-review' || path === '/weekly-review') return { status: 200, body: WEEKLY_REVIEW };
  if (path === '/strategy/monthly-review' || path === '/monthly-review') return { status: 200, body: { monthStart: '2026-05-01', monthEnd: '2026-05-31', completedTasks: 58, delayedTasks: 7, failedTasks: 2, journalEntries: [] } };
  if (path === '/strategy/review-journal' || path === '/review-journal') return { status: 200, body: { review: null, entries: [] } };
  if (path === '/strategy/review-history' || path === '/review-history') return { status: 200, body: [] };
  if (path === '/strategy/workspace-portfolio' || path === '/workspace-portfolio') return { status: 200, body: { weekStart: '2026-05-19', weekEnd: '2026-05-25', rows: [
    { workspaceId: 'ws-1', workspaceName: 'Negócios', workspaceColor: '#f97316', workspaceMode: 'expansao', hoursInvested: 28, deepWorkHours: 8, tasksCompleted: 11, tasksDelayed: 1, frontHealth: { status: 'healthy', score: 82, issues: [] } },
    { workspaceId: 'ws-2', workspaceName: 'Vida', workspaceColor: '#818cf8', workspaceMode: 'manutencao', hoursInvested: 7, deepWorkHours: 2, tasksCompleted: 3, tasksDelayed: 0, frontHealth: { status: 'healthy', score: 90, issues: [] } },
  ], summary: { totalHoursInvested: 35, deepWorkHours: 10, totalTasksCompleted: 14, totalTasksDelayed: 1, disconnectedHours: 4 } } };

  if (path === '/inbox') return { status: 200, body: { items: INBOX_ITEMS, contexts: [] } };
  if (path === '/inbox/contexts') return { status: 200, body: [] };
  if (path.match(/^\/daily-execution\/\d{4}-\d{2}-\d{2}$/)) {
    return { status: 200, body: { entries: DAILY_EXECUTION_ITEMS, rollover: DAILY_EXECUTION_ROLLOVER } };
  }

  if (path === '/notes') return { status: 200, body: [] };
  if (path === '/note-folders') return { status: 200, body: [] };
  if (path === '/notes/transcription-capabilities') return { status: 200, body: { available: false } };

  if (path === '/deep-work/active') return { status: 200, body: null };
  if (path.match(/^\/deep-work\/summary\//)) return { status: 200, body: { date: today, totalMinutes: 110, sessions: [] } };

  if (path === '/recurring-blocks') return { status: 200, body: [] };
  if (path === '/task-intelligence') return { status: 200, body: { tasks: [] } };

  // Unknown route — return empty 200
  return { status: 200, body: null };
}

// ─── Install interceptor ──────────────────────────────────────────────────────

export function installMockFetch() {
  const originalFetch = window.fetch.bind(window);
  DEMO_NOTES = cloneDemoValue(INITIAL_DEMO_NOTES);
  DEMO_NOTE_ARTIFACTS = cloneDemoValue(INITIAL_DEMO_NOTE_ARTIFACTS);
  DEMO_NOTE_FOLDERS = cloneDemoValue(INITIAL_DEMO_NOTE_FOLDERS);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const rawPath = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const isDemoApi = url.includes('localhost:3000') || url.includes('localhost:3001') || rawPath.startsWith('/api/');

    // Mock the local API and relative /api URLs used by hosted demo previews.
    if (isDemoApi) {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = rawPath.replace(/^\/api(?=\/|$)/, '');
      const requestUrl = new URL(url, window.location.origin);
      const jsonResponse = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' }
        });
      const artifactSummary = ({ data: _data, createdAt: _createdAt, ...artifact }: NoteArtifact) =>
        artifact;

      if (method === 'GET' && path === '/note-folders') {
        return jsonResponse(DEMO_NOTE_FOLDERS);
      }

      if (method === 'POST' && path === '/note-folders') {
        const payload = JSON.parse(String(init?.body ?? '{}')) as Partial<NoteFolder>;
        const timestamp = new Date().toISOString();
        const folder: NoteFolder = {
          id: `note-folder-demo-${Date.now()}`,
          name: payload.name?.trim() || 'Nova pasta',
          color: payload.color ?? null,
          parentId: payload.parentId ?? null,
          sortOrder: payload.sortOrder ?? DEMO_NOTE_FOLDERS.length,
          createdAt: timestamp,
          updatedAt: timestamp,
          archivedAt: null
        };
        DEMO_NOTE_FOLDERS = [...DEMO_NOTE_FOLDERS, folder];
        return jsonResponse(folder, 201);
      }

      if (method === 'PATCH' && /^\/note-folders\/[^/]+$/.test(path)) {
        const folderId = path.split('/').at(-1)!;
        const payload = JSON.parse(String(init?.body ?? '{}')) as Partial<NoteFolder>;
        const index = DEMO_NOTE_FOLDERS.findIndex((folder) => folder.id === folderId);
        if (index < 0) return jsonResponse({ message: 'Pasta não encontrada.' }, 404);
        const folder = {
          ...DEMO_NOTE_FOLDERS[index],
          ...payload,
          id: folderId,
          updatedAt: new Date().toISOString()
        };
        DEMO_NOTE_FOLDERS = DEMO_NOTE_FOLDERS.map((item, itemIndex) =>
          itemIndex === index ? folder : item
        );
        return jsonResponse(folder);
      }

      if (method === 'DELETE' && /^\/note-folders\/[^/]+$/.test(path)) {
        const folderId = path.split('/').at(-1)!;
        DEMO_NOTE_FOLDERS = DEMO_NOTE_FOLDERS.filter((folder) => folder.id !== folderId);
        DEMO_NOTES = DEMO_NOTES.map((note) =>
          note.folderId === folderId ? { ...note, folderId: null, folder: null } : note
        );
        return jsonResponse({ ok: true });
      }

      if (method === 'GET' && path === '/notes/library') {
        const view = requestUrl.searchParams.get('view');
        const folderId = requestUrl.searchParams.get('folderId');
        const query = requestUrl.searchParams.get('q')?.trim().toLowerCase();
        const rows = DEMO_NOTES
          .filter((note) => !note.archivedAt)
          .filter((note) => {
            if (folderId) return note.folderId === folderId;
            if (view === 'inbox') return note.folderId == null;
            if (view === 'pinned') return note.pinned;
            return true;
          })
          .filter((note) => {
            if (!query) return true;
            return [note.title, note.contentText, note.content, ...note.tags]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(query));
          })
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .map((note) => ({
            id: note.id,
            title: note.title,
            type: note.type,
            tags: note.tags,
            pinned: note.pinned,
            folderId: note.folderId,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            editVersion: note.editVersion,
            excerpt: (note.contentText ?? note.content ?? '').replace(/\s+/g, ' ').slice(0, 180),
            folder: note.folder
              ? { id: note.folder.id, name: note.folder.name, parentId: note.folder.parentId }
              : null
          }));
        return jsonResponse(rows);
      }

      if (method === 'GET' && path === '/notes') {
        return jsonResponse(DEMO_NOTES.filter((note) => !note.archivedAt));
      }

      if (method === 'POST' && path === '/notes') {
        const payload = JSON.parse(String(init?.body ?? '{}')) as Partial<Note>;
        const timestamp = new Date().toISOString();
        const folder = DEMO_NOTE_FOLDERS.find((item) => item.id === payload.folderId) ?? null;
        const note: Note = {
          id: `note-demo-${Date.now()}`,
          title: payload.title?.trim() || 'Sem título',
          content: payload.content ?? null,
          contentBlocks: payload.contentBlocks ?? [],
          contentText: payload.contentText ?? payload.content ?? null,
          contentHtml: payload.contentHtml ?? null,
          contentVersion: payload.contentVersion ?? 1,
          editVersion: 1,
          type: payload.type ?? 'geral',
          tags: payload.tags ?? [],
          pinned: payload.pinned ?? false,
          folderId: payload.folderId ?? null,
          workspaceId: payload.workspaceId ?? null,
          projectId: payload.projectId ?? null,
          taskId: payload.taskId ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
          archivedAt: null,
          folder,
          workspace: null,
          project: null,
          task: null
        };
        DEMO_NOTES = [note, ...DEMO_NOTES];
        return jsonResponse(note, 201);
      }

      if (method === 'GET' && path === '/notes/transcription-capabilities') {
        return jsonResponse({ available: false });
      }

      if (method === 'GET' && /^\/notes\/[^/]+\/artifacts$/.test(path)) {
        const noteId = path.split('/')[2];
        return jsonResponse(
          DEMO_NOTE_ARTIFACTS.filter((artifact) => artifact.noteId === noteId).map(artifactSummary)
        );
      }

      if (method === 'POST' && /^\/notes\/[^/]+\/artifacts\/generate$/.test(path)) {
        const noteId = path.split('/')[2];
        const note = DEMO_NOTES.find((item) => item.id === noteId);
        if (!note) return jsonResponse({ error: 'note_not_found' }, 404);
        const source = (note.contentText ?? note.content ?? '').trim();
        if (source.length < 50) return jsonResponse({ error: 'note_content_too_short' }, 422);
        const payload = JSON.parse(String(init?.body ?? '{}')) as {
          kind: 'diagram' | 'mindmap';
          title?: string;
        };
        const timestamp = new Date().toISOString();
        const artifact: NoteArtifact = {
          id: `artifact-demo-${Date.now()}`,
          noteId,
          kind: payload.kind,
          title: payload.title ?? (payload.kind === 'diagram' ? 'Diagrama gerado' : 'Mapa mental gerado'),
          data: payload.kind === 'diagram'
            ? { nodes: [{ id: 'source', label: note.title }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
            : { nodeData: { id: 'root', topic: note.title, children: [] } },
          editVersion: 1,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        DEMO_NOTE_ARTIFACTS = [...DEMO_NOTE_ARTIFACTS, artifact];
        return jsonResponse(artifact, 201);
      }

      if (method === 'POST' && /^\/notes\/[^/]+\/artifacts$/.test(path)) {
        const noteId = path.split('/')[2];
        if (!DEMO_NOTES.some((note) => note.id === noteId)) {
          return jsonResponse({ error: 'note_not_found' }, 404);
        }
        const payload = JSON.parse(String(init?.body ?? '{}')) as Pick<
          NoteArtifact,
          'kind' | 'title' | 'data'
        >;
        const timestamp = new Date().toISOString();
        const artifact: NoteArtifact = {
          id: `artifact-demo-${Date.now()}`,
          noteId,
          kind: payload.kind,
          title: payload.title ?? null,
          data: payload.data ?? {},
          editVersion: 1,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        DEMO_NOTE_ARTIFACTS = [...DEMO_NOTE_ARTIFACTS, artifact];
        return jsonResponse(artifact, 201);
      }

      if (method === 'GET' && /^\/notes\/[^/]+\/artifacts\/[^/]+$/.test(path)) {
        const [, , noteId, , artifactId] = path.split('/');
        const artifact = DEMO_NOTE_ARTIFACTS.find(
          (item) => item.id === artifactId && item.noteId === noteId
        );
        return artifact
          ? jsonResponse(artifact)
          : jsonResponse({ error: 'artifact_not_found' }, 404);
      }

      if (method === 'PATCH' && /^\/notes\/[^/]+\/artifacts\/[^/]+$/.test(path)) {
        const [, , noteId, , artifactId] = path.split('/');
        const payload = JSON.parse(String(init?.body ?? '{}')) as Partial<NoteArtifact> & {
          baseVersion?: number;
        };
        const index = DEMO_NOTE_ARTIFACTS.findIndex(
          (artifact) => artifact.id === artifactId && artifact.noteId === noteId
        );
        if (index < 0) return jsonResponse({ error: 'artifact_not_found' }, 404);
        if (payload.baseVersion !== DEMO_NOTE_ARTIFACTS[index].editVersion) {
          return jsonResponse({ error: 'artifact_version_conflict' }, 409);
        }
        const artifact = {
          ...DEMO_NOTE_ARTIFACTS[index],
          ...(payload.title !== undefined ? { title: payload.title } : {}),
          ...(payload.data !== undefined ? { data: payload.data } : {}),
          editVersion: DEMO_NOTE_ARTIFACTS[index].editVersion + 1,
          updatedAt: new Date().toISOString()
        };
        DEMO_NOTE_ARTIFACTS = DEMO_NOTE_ARTIFACTS.map((item, itemIndex) =>
          itemIndex === index ? artifact : item
        );
        return jsonResponse(artifact);
      }

      if (method === 'DELETE' && /^\/notes\/[^/]+\/artifacts\/[^/]+$/.test(path)) {
        const artifactId = path.split('/').at(-1)!;
        DEMO_NOTE_ARTIFACTS = DEMO_NOTE_ARTIFACTS.filter(
          (artifact) => artifact.id !== artifactId
        );
        return new Response(null, { status: 204 });
      }

      if (method === 'GET' && /^\/notes\/[^/]+$/.test(path)) {
        const noteId = path.split('/')[2];
        const note = DEMO_NOTES.find((item) => item.id === noteId);
        if (!note) return jsonResponse({ message: 'Nota não encontrada.' }, 404);
        const artifacts = DEMO_NOTE_ARTIFACTS.filter(
          (artifact) => artifact.noteId === noteId
        ).map(artifactSummary);
        return jsonResponse({ ...note, artifacts });
      }

      if (method === 'PATCH' && /^\/notes\/[^/]+$/.test(path)) {
        const noteId = path.split('/')[2];
        const payload = JSON.parse(String(init?.body ?? '{}')) as Partial<Note> & {
          baseVersion?: number;
          archived?: boolean;
          saveSource?: string;
        };
        const index = DEMO_NOTES.findIndex((note) => note.id === noteId);
        if (index < 0) return jsonResponse({ message: 'Nota não encontrada.' }, 404);
        const current = DEMO_NOTES[index];
        if (
          payload.baseVersion !== current.editVersion &&
          !(payload.baseVersion === undefined && payload.saveSource === 'system')
        ) {
          return jsonResponse({ error: 'note_version_conflict' }, 409);
        }
        const { baseVersion: _baseVersion, archived, saveSource: _saveSource, ...changes } = payload;
        const folder = changes.folderId === undefined
          ? current.folder
          : DEMO_NOTE_FOLDERS.find((item) => item.id === changes.folderId) ?? null;
        const note: Note = {
          ...current,
          ...changes,
          id: noteId,
          folder,
          archivedAt: archived === undefined
            ? current.archivedAt
            : archived
              ? new Date().toISOString()
              : null,
          editVersion: current.editVersion + 1,
          updatedAt: new Date().toISOString()
        };
        DEMO_NOTES = DEMO_NOTES.map((item, itemIndex) => (itemIndex === index ? note : item));
        return jsonResponse(note);
      }

      if (method === 'DELETE' && /^\/notes\/[^/]+$/.test(path)) {
        const noteId = path.split('/')[2];
        DEMO_NOTES = DEMO_NOTES.filter((note) => note.id !== noteId);
        DEMO_NOTE_ARTIFACTS = DEMO_NOTE_ARTIFACTS.filter(
          (artifact) => artifact.noteId !== noteId
        );
        return jsonResponse({ ok: true });
      }

      if (method === 'POST' && path === '/project-execution') {
        const payload = JSON.parse(String(init?.body ?? '{}')) as {
          workspaceId: string; methodology: ProjectCockpit['engine']['methodology']; title: string;
          objective: string; timeHorizonEnd?: string | null; methodologyData?: ProjectCockpit['engine']['data'];
          nextMove: string; nextMoveDestination: 'project' | 'backlog' | 'today';
        };
        const workspace = [WS_NEGOCIOS, WS_VIDA, WS_CRIACAO].find((item) => item.id === payload.workspaceId) ?? WS_NEGOCIOS;
        const id = `proj-demo-${Date.now()}`;
        const move = { id: `move-demo-${Date.now()}`, projectId: id, text: payload.nextMove, source: 'manual' as const, status: 'active' as const, createdAt: new Date().toISOString() };
        const cockpit: ProjectCockpit = {
          id, title: payload.title, objective: payload.objective, workspace,
          intentLabel: 'Avançar uma direção', methodLabel: payload.methodology,
          persistedStatus: 'ativo', operationalState: 'moving', timeHorizonEnd: payload.timeHorizonEnd ?? null,
          progress: { kind: 'percent', value: 0, label: 'Começando' }, primaryBlocker: null,
          activeMove: move, recommendation: null,
          engine: { key: payload.methodology, methodology: payload.methodology, data: payload.methodologyData ?? {}, recovered: false },
          tasks: []
        };
        DEMO_PROJECT_COCKPITS = [...DEMO_PROJECT_COCKPITS, cockpit];
        return new Response(JSON.stringify({
          project: { id, title: payload.title, objective: payload.objective, workspaceId: workspace.id, workspace, status: 'ativo', methodology: payload.methodology, methodologyData: cockpit.engine.data },
          activeMove: move,
          task: null
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'POST' && path.match(/^\/projects\/[^/]+\/next-moves$/)) {
        const projectId = path.split('/')[2];
        const payload = JSON.parse(String(init?.body ?? '{}')) as { text: string; source: 'manual' | 'recommendation'; reason?: string; ruleKey?: string };
        const move = { id: `move-demo-${Date.now()}`, projectId, ...payload, status: 'active' as const, createdAt: new Date().toISOString() };
        DEMO_PROJECT_COCKPITS = DEMO_PROJECT_COCKPITS.map((project) => project.id === projectId ? { ...project, activeMove: move, recommendation: null, operationalState: 'moving' } : project);
        return new Response(JSON.stringify(move), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'POST' && path.match(/^\/projects\/[^/]+\/next-moves\/[^/]+\/to-today$/)) {
        const [, , projectId, , moveId] = path.split('/');
        const project = DEMO_PROJECT_COCKPITS.find((item) => item.id === projectId);
        const move = project?.activeMove?.id === moveId ? project.activeMove : null;
        if (!project || !move) return new Response(JSON.stringify({ message: 'Movimento não encontrado.' }), { status: 404 });
        const task: ProjectCockpit['tasks'][number] = { id: `task-demo-${Date.now()}`, title: move.text, status: 'hoje', priority: 3, workspaceId: project.workspace.id, projectId: project.id };
        project.tasks = [...project.tasks, task];
        return new Response(JSON.stringify({ move: { ...move, taskId: task.id }, task }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'POST' && path.match(/^\/projects\/[^/]+\/next-moves\/[^/]+\/resolve$/)) {
        const [, , projectId, , moveId] = path.split('/');
        const project = DEMO_PROJECT_COCKPITS.find((item) => item.id === projectId);
        const move = project?.activeMove?.id === moveId ? { ...project.activeMove, status: 'resolved' as const, resolvedAt: new Date().toISOString() } : null;
        if (!project || !move) return new Response(JSON.stringify({ message: 'Movimento não encontrado.' }), { status: 404 });
        project.activeMove = null;
        return new Response(JSON.stringify(move), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'POST' && path.match(/^\/workspaces\/[^/]+\/responsibilities$/)) {
        const workspaceId = path.split('/')[2];
        const payload = JSON.parse(String(init?.body ?? '{}')) as Omit<Responsibility, 'id' | 'workspaceId' | 'status' | 'createdAt' | 'updatedAt'>;
        const responsibility: Responsibility = { ...payload, id: `resp-demo-${Date.now()}`, workspaceId, status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        DEMO_RESPONSIBILITIES = [...DEMO_RESPONSIBILITIES, responsibility];
        return new Response(JSON.stringify(responsibility), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'PATCH' && path.match(/^\/responsibilities\/[^/]+$/)) {
        const id = path.split('/')[2];
        const payload = JSON.parse(String(init?.body ?? '{}')) as Partial<Responsibility>;
        let updated: Responsibility | undefined;
        DEMO_RESPONSIBILITIES = DEMO_RESPONSIBILITIES.map((item) => item.id === id ? (updated = { ...item, ...payload, id, updatedAt: new Date().toISOString() }) : item);
        return new Response(JSON.stringify(updated ?? { message: 'Responsabilidade não encontrada.' }), { status: updated ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'POST' && path.match(/^\/responsibilities\/[^/]+\/reviews$/)) {
        const id = path.split('/')[2];
        const payload = JSON.parse(String(init?.body ?? '{}')) as { health: Responsibility['health']; note?: string; nextCare: string; nextReviewAt?: string };
        const responsibility = DEMO_RESPONSIBILITIES.find((item) => item.id === id);
        if (!responsibility) return new Response(JSON.stringify({ message: 'Responsabilidade não encontrada.' }), { status: 404 });
        Object.assign(responsibility, { health: payload.health, nextCare: payload.nextCare, nextReviewAt: payload.nextReviewAt ?? responsibility.nextReviewAt, lastReviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        return new Response(JSON.stringify({ responsibility, review: { id: `review-demo-${Date.now()}`, responsibilityId: id, ...payload, nextReviewAt: responsibility.nextReviewAt, reviewedAt: responsibility.lastReviewedAt }, task: null }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'POST' && path.match(/^\/responsibilities\/[^/]+\/(pause|archive)$/)) {
        const id = path.split('/')[2];
        const responsibility = DEMO_RESPONSIBILITIES.find((item) => item.id === id);
        if (!responsibility) return new Response(JSON.stringify({ message: 'Responsabilidade não encontrada.' }), { status: 404 });
        if (path.endsWith('/archive')) responsibility.status = 'archived';
        else {
          const payload = JSON.parse(String(init?.body ?? '{}')) as { paused?: boolean };
          responsibility.status = payload.paused === false ? 'active' : 'paused';
        }
        responsibility.updatedAt = new Date().toISOString();
        return new Response(JSON.stringify(responsibility), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'POST' && path.match(/^\/day-plans\/\d{4}-\d{2}-\d{2}\/items$/)) {
        const payload = JSON.parse(String(init?.body ?? '{}')) as {
          taskId?: string | null;
          inboxItemId?: string | null;
          startTime: string;
          endTime: string;
          orderIndex?: number;
          blockType?: 'task' | 'fixed';
        };
        const task = TASKS.find((item) => item.id === payload.taskId) ?? null;
        const inbox = INBOX_ITEMS.find((item) => item.id === payload.inboxItemId) ?? null;
        const created: DemoDayPlanItem = {
          id: `dpi-${NEXT_DAY_PLAN_ITEM_ID++}`,
          dayPlanId: DAY_PLAN.id,
          taskId: task?.id ?? null,
          inboxItemId: inbox?.id ?? null,
          startTime: payload.startTime,
          endTime: payload.endTime,
          completedAt: null,
          orderIndex: payload.orderIndex ?? DAY_PLAN.items.length,
          blockType: payload.blockType ?? 'task',
          confirmationState: 'pending',
          task,
          inboxItem: inbox
            ? {
                id: inbox.id,
                content: inbox.content,
                workspaceId: inbox.workspaceId,
                workspace: inbox.workspace
              }
            : null
        };
        DAY_PLAN.items = [...DAY_PLAN.items, created];
        return new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (method === 'PATCH' && path.match(/^\/day-plan-items\/[^/]+$/)) {
        const id = path.split('/').at(-1);
        const payload = JSON.parse(String(init?.body ?? '{}')) as Partial<DemoDayPlanItem>;
        const index = DAY_PLAN.items.findIndex((item) => item.id === id);
        if (index < 0) return new Response(JSON.stringify({ message: 'Bloco não encontrado.' }), { status: 404 });
        const updated = { ...DAY_PLAN.items[index], ...payload, id: DAY_PLAN.items[index].id };
        DAY_PLAN.items = DAY_PLAN.items.map((item, itemIndex) => itemIndex === index ? updated : item);
        if (updated.inboxItemId) {
          const inbox = INBOX_ITEMS.find((item) => item.id === updated.inboxItemId);
          if (inbox && Object.prototype.hasOwnProperty.call(payload, 'completedAt')) {
            inbox.status = updated.completedAt ? 'feito' : 'pendente';
          }
        }
        return new Response(JSON.stringify(updated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (method === 'DELETE' && path.match(/^\/day-plan-items\/[^/]+$/)) {
        const id = path.split('/').at(-1);
        DAY_PLAN.items = DAY_PLAN.items.filter((item) => item.id !== id);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (method === 'PATCH' && path.match(/^\/daily-execution-items\/[^/]+$/)) {
        const id = path.split('/').at(-1);
        const payload = JSON.parse(String(init?.body ?? '{}')) as { completed?: boolean };
        DAILY_EXECUTION_ITEMS = DAILY_EXECUTION_ITEMS.map((item) => item.id === id
          ? { ...item, completedAt: payload.completed ? new Date().toISOString() : null }
          : item);
        return new Response(JSON.stringify(DAILY_EXECUTION_ITEMS.find((item) => item.id === id)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (method === 'DELETE' && path.match(/^\/daily-execution-items\/[^/]+$/)) {
        const id = path.split('/').at(-1);
        DAILY_EXECUTION_ITEMS = DAILY_EXECUTION_ITEMS.filter((item) => item.id !== id);
        return new Response(null, { status: 204 });
      }

      if (method === 'POST' && path.match(/^\/daily-execution-items\/[^/]+\/rollover$/)) {
        const id = path.split('/').at(-2);
        const source = DAILY_EXECUTION_ROLLOVER.find((item) => item.id === id);
        const payload = JSON.parse(String(init?.body ?? '{}')) as { action?: string; targetDate?: string };
        DAILY_EXECUTION_ROLLOVER = DAILY_EXECUTION_ROLLOVER.filter((item) => item.id !== id);
        const resolved = source && payload.action === 'keep_today'
          ? { ...source, date: payload.targetDate ?? today, position: DAILY_EXECUTION_ITEMS.length }
          : null;
        if (resolved) DAILY_EXECUTION_ITEMS = [...DAILY_EXECUTION_ITEMS, resolved];
        return new Response(resolved ? JSON.stringify(resolved) : null, {
          status: resolved ? 200 : 204,
          headers: resolved ? { 'Content-Type': 'application/json' } : undefined,
        });
      }

      if (method === 'POST' && path === '/execution-sessions/start') {
        const payload = JSON.parse(String(init?.body ?? '{}')) as {
          sourceType: 'task' | 'inbox';
          sourceId: string;
          dayPlanItemId?: string | null;
          dailyExecutionItemId?: string | null;
        };
        const task = TASKS.find((item) => payload.sourceType === 'task' && item.id === payload.sourceId);
        const inbox = INBOX_ITEMS.find((item) => payload.sourceType === 'inbox' && item.id === payload.sourceId);
        ACTIVE_EXECUTION = {
          id: `execution-${Date.now()}`,
          kind: payload.sourceType,
          sourceId: payload.sourceId,
          title: task?.title ?? inbox?.content ?? 'Execução atual',
          startedAt: new Date().toISOString(),
          endedAt: null,
          state: 'active',
          dayPlanItemId: payload.dayPlanItemId ?? null,
          dailyExecutionItemId: payload.dailyExecutionItemId ?? null
        };
        return new Response(JSON.stringify(ACTIVE_EXECUTION), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (method === 'POST' && path.match(/^\/execution-sessions\/[^/]+\/(stop|cancel)$/)) {
        const cancelled = path.endsWith('/cancel');
        ACTIVE_EXECUTION = ACTIVE_EXECUTION
          ? { ...ACTIVE_EXECUTION, endedAt: new Date().toISOString(), state: cancelled ? 'cancelled' : 'completed' }
          : null;
        const ended = ACTIVE_EXECUTION;
        ACTIVE_EXECUTION = null;
        return new Response(JSON.stringify(ended), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (/^\/habits\/[^/]+\/log$/.test(path) && (method === 'PUT' || method === 'POST')) {
        const payload = JSON.parse(String(init?.body ?? '{}')) as { date: string; value?: number };
        return new Response(JSON.stringify({
          id: method === 'PUT' ? 'demo-absolute-log' : 'demo-increment-log',
          habitId: path.split('/')[2],
          date: payload.date,
          value: payload.value ?? 1,
          note: null,
          createdAt: new Date().toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Other demo mutations are accepted without persisting them.
      if (method !== 'GET') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const mock = matchRoute(url);
      const body = mock ?? { status: 200, body: null };
      return new Response(JSON.stringify(body.body), {
        status: body.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return originalFetch(input, init);
  };
}
