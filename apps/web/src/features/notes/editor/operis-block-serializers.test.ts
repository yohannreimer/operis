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

  it('preserves BlockNote link inline content', () => {
    const result = serializeNoteBlocks([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Veja ', styles: {} },
          {
            type: 'link',
            href: 'https://example.com',
            content: [{ type: 'text', text: 'docs', styles: {} }]
          }
        ]
      }
    ]);

    expect(result.text).toBe('Veja docs');
    expect(result.markdown).toBe('Veja docs');
    expect(result.whatsapp).toBe('Veja docs');
    expect(result.html).toBe('<p>Veja docs</p>');
  });

  it('serializes nested children with indentation instead of dropping hierarchy', () => {
    const result = serializeNoteBlocks([
      {
        type: 'bulletListItem',
        content: 'Pai',
        children: [
          {
            type: 'checkListItem',
            props: { checked: true },
            content: 'Filho'
          }
        ]
      }
    ]);

    expect(result.text).toContain('- Pai\n  [x] Filho');
    expect(result.markdown).toContain('- Pai\n  - [x] Filho');
    expect(result.whatsapp).toContain('- Pai\n  [x] Filho');
    expect(result.html).toContain('<ul><li>Pai</li></ul>');
    expect(result.html).toContain('<label><input type="checkbox" checked disabled> Filho</label>');
  });

  it('escapes hostile inline text in html output', () => {
    const result = serializeNoteBlocks([
      {
        type: 'paragraph',
        content: '<img src=x onerror=alert(1)>'
      }
    ]);

    expect(result.text).toBe('<img src=x onerror=alert(1)>');
    expect(result.html).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });
});
