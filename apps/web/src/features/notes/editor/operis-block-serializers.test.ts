import { describe, expect, it } from 'vitest';
import { serializeNoteBlocks } from './operis-block-serializers';

describe('serializeNoteBlocks', () => {
  it('serializes common and Operis blocks to text and WhatsApp', () => {
    const result = serializeNoteBlocks([
      { type: 'heading', props: { level: 1 }, content: 'Reunião semanal' },
      {
        type: 'operisDecision',
        props: { title: 'Priorizar onboarding', reason: 'Ativação caiu', nextStep: 'Criar roteiro' }
      },
      { type: 'operisNextStep', props: { text: 'Enviar plano', status: 'open' } }
    ]);

    expect(result.text).toContain('Reunião semanal');
    expect(result.text).toContain('Decisão: Priorizar onboarding');
    expect(result.text).toContain('Próximo passo: Enviar plano');
    expect(result.whatsapp).toContain('*Reunião semanal*');
    expect(result.html).toContain('Priorizar onboarding');
  });
});
