// src/demo/mock-fetch.ts
// Intercepts window.fetch and returns mock data for all API routes.
// Installed before React mounts when VITE_DEMO_MODE=true.

import type { TodayEntry } from '../features/today/types';

const localNow = new Date();
const today = [localNow.getFullYear(), String(localNow.getMonth() + 1).padStart(2, '0'), String(localNow.getDate()).padStart(2, '0')].join('-');
const localYesterday = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate() - 1);
const yesterday = [localYesterday.getFullYear(), String(localYesterday.getMonth() + 1).padStart(2, '0'), String(localYesterday.getDate()).padStart(2, '0')].join('-');

// ─── Shared entities ──────────────────────────────────────────────────────────

const WS_NEGOCIOS = { id: 'ws-1', name: 'Negócios', type: 'empresa', color: '#f97316', mode: 'expansao' };
const WS_VIDA = { id: 'ws-2', name: 'Vida', type: 'vida', color: '#818cf8', mode: 'manutencao' };

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
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];

  if (path === '/workspaces') return { status: 200, body: [WS_NEGOCIOS, WS_VIDA] };
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

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

    // Only mock calls to our local API (port 3000 or VITE_API_URL)
    if (url.includes('localhost:3000') || url.includes('localhost:3001')) {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];

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
