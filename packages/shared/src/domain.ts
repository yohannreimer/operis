export type TaskStatus = 'backlog' | 'hoje' | 'andamento' | 'feito' | 'arquivado';
export type WorkspaceType = 'empresa' | 'pessoal' | 'vida' | 'autoridade' | 'geral' | 'outro';
export type WaitingPriority = 'alta' | 'media' | 'baixa';

export const gamificationDelta = {
  on_time: 10,
  late: 5,
  postponed: -5,
  not_confirmed: -8
} as const;
