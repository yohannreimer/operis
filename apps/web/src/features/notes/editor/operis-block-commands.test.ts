import { describe, expect, it, vi } from 'vitest';
import { buildOperisSlashMenuItems } from './operis-block-commands';
import { OPERIS_BLOCK_SNIPPETS } from './operis-block-templates';

describe('Operis BlockNote commands', () => {
  it('exposes native snippets for executive note patterns', () => {
    expect(Object.keys(OPERIS_BLOCK_SNIPPETS).sort()).toEqual([
      'decision',
      'executiveChecklist',
      'insight',
      'meeting',
      'nextStep',
      'retro',
      'risk'
    ]);
    expect(OPERIS_BLOCK_SNIPPETS.decision[0]).toMatchObject({
      type: 'operisDecision',
      content: expect.any(String)
    });
    expect(String(OPERIS_BLOCK_SNIPPETS.decision[0].content).trim()).not.toBe('');
  });

  it('groups slash commands and delegates page-level actions to callbacks', () => {
    const onCommand = vi.fn();
    const editor = {} as never;
    const items = buildOperisSlashMenuItems({ onCommand, editor });

    expect(items.map((item) => [item.title, item.group])).toEqual(
      expect.arrayContaining([
        ['Decisão executiva', 'Operis'],
        ['Diagrama', 'Operis'],
        ['Mapa mental', 'Operis'],
        ['Quadro livre', 'Operis'],
        ['Checklist comum', 'Estrutura'],
        ['Templates', 'Exportar'],
        ['Detalhes', 'Exportar'],
        ['Salvar', 'Exportar']
      ])
    );

    items.find((item) => item.title === 'Templates')?.onItemClick();
    items.find((item) => item.title === 'Detalhes')?.onItemClick();
    items.find((item) => item.title === 'Salvar')?.onItemClick();
    items.find((item) => item.title === 'Diagrama')?.onItemClick();

    expect(onCommand).toHaveBeenCalledTimes(4);
    expect(onCommand).toHaveBeenNthCalledWith(1, 'templates', editor);
    expect(onCommand).toHaveBeenNthCalledWith(2, 'details', editor);
    expect(onCommand).toHaveBeenNthCalledWith(3, 'save', editor);
    expect(onCommand).toHaveBeenNthCalledWith(4, 'insertDiagram', editor);
  });
});
