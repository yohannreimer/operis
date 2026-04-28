import type { OperisBlock } from './operis-block-types';

export type OperisBlockTemplate = {
  id: string;
  title: string;
  blocks: OperisBlock[];
};

export const OPERIS_BLOCK_SNIPPETS: Record<string, OperisBlock[]> = {
  decision: [{ type: 'operisDecision', props: { title: '', reason: '', nextStep: '' } }],
  retro: [
    { type: 'heading', props: { level: 2 }, content: 'Retro rápida' },
    { type: 'bulletListItem', content: 'Funcionou:' },
    { type: 'bulletListItem', content: 'Não funcionou:' },
    { type: 'bulletListItem', content: 'Ajuste:' }
  ],
  nextStep: [{ type: 'operisNextStep', props: { text: '', status: 'open' } }],
  risk: [{ type: 'operisRisk', props: { risk: '', impact: '', mitigation: '' } }],
  insight: [{ type: 'operisInsight', props: { text: '' } }],
  meeting: [
    { type: 'operisMeeting', props: { title: 'Reunião', participants: '', agenda: '' }, children: [] }
  ],
  executiveChecklist: [{ type: 'operisExecutiveChecklist', props: { label: 'Checklist executivo' } }]
};
