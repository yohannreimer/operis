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

  it('serializes BlockNote link inline content as links where supported', () => {
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
    expect(result.markdown).toBe('Veja [docs](https://example.com)');
    expect(result.whatsapp).toBe('Veja docs (https://example.com)');
    expect(result.html).toBe('<p>Veja <a href="https://example.com">docs</a></p>');
  });

  it('renders unsafe BlockNote link hrefs as plain text', () => {
    const result = serializeNoteBlocks([
      {
        type: 'paragraph',
        content: [
          {
            type: 'link',
            href: 'javascript:alert(1)',
            content: [{ type: 'text', text: 'abrir', styles: {} }]
          }
        ]
      }
    ]);

    expect(result.text).toBe('abrir');
    expect(result.markdown).toBe('abrir');
    expect(result.whatsapp).toBe('abrir');
    expect(result.html).toBe('<p>abrir</p>');
  });

  it('escapes markdown control characters in BlockNote link labels', () => {
    const result = serializeNoteBlocks([
      {
        type: 'paragraph',
        content: [
          {
            type: 'link',
            href: 'https://example.com',
            content: [{ type: 'text', text: 'x](javascript:alert(1))', styles: {} }]
          }
        ]
      }
    ]);

    expect(result.markdown).toBe('[x\\]\\(javascript:alert\\(1\\)\\)](https://example.com)');
    expect(result.html).toBe('<p><a href="https://example.com">x](javascript:alert(1))</a></p>');
  });

  it('prefers editable inline content over stale custom block props', () => {
    const result = serializeNoteBlocks([
      {
        type: 'operisDecision',
        props: { title: 'Título antigo', reason: 'Dados de ativação', nextStep: '' },
        content: 'Priorizar onboarding'
      },
      {
        type: 'operisNextStep',
        props: { text: '', status: 'open' },
        content: 'Enviar plano'
      }
    ]);

    expect(result.text).toContain('Decisão: Priorizar onboarding');
    expect(result.text).toContain('Motivo: Dados de ativação');
    expect(result.text).toContain('Próximo passo: Enviar plano');
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
    expect(result.html).toContain(
      '<ul><li>Pai\n<label><input type="checkbox" checked disabled> Filho</label></li></ul>'
    );
  });

  it('serializes table blocks for export surfaces', () => {
    const result = serializeNoteBlocks([
      {
        type: 'table',
        content: {
          type: 'tableContent',
          rows: [{ cells: ['Campo', 'Valor'] }, { cells: ['Prioridade', 'Alta'] }]
        }
      }
    ]);

    expect(result.text).toBe('Campo | Valor\nPrioridade | Alta');
    expect(result.markdown).toBe('| Campo | Valor |\n| --- | --- |\n| Prioridade | Alta |');
    expect(result.html).toBe(
      '<table><thead><tr><th>Campo</th><th>Valor</th></tr></thead><tbody><tr><td>Prioridade</td><td>Alta</td></tr></tbody></table>'
    );
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
