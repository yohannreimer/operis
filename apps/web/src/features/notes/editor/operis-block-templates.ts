import type { OperisBlock } from './operis-block-types';

export type OperisBlockTemplate = {
  id: string;
  title: string;
  blocks: OperisBlock[];
};

export const OPERIS_BLOCK_SNIPPETS: Record<string, OperisBlock[]> = {
  decision: [{ type: 'operisDecision', content: 'Descreva a decisão', props: { reason: '', nextStep: '' } }],
  retro: [
    { type: 'heading', props: { level: 2 }, content: 'Retro rápida' },
    { type: 'bulletListItem', content: 'Funcionou:' },
    { type: 'bulletListItem', content: 'Não funcionou:' },
    { type: 'bulletListItem', content: 'Ajuste:' }
  ],
  nextStep: [{ type: 'operisNextStep', content: 'Descreva o próximo passo', props: { status: 'open' } }],
  risk: [{ type: 'operisRisk', content: 'Descreva o risco', props: { impact: '', mitigation: '' } }],
  insight: [{ type: 'operisInsight', content: 'Registre o insight' }],
  meeting: [
    { type: 'operisMeeting', content: 'Resumo da reunião', props: { title: 'Reunião', participants: '', agenda: '' } }
  ],
  executiveChecklist: [{ type: 'operisExecutiveChecklist', content: 'Checklist executivo', props: { label: 'Checklist' } }]
};
