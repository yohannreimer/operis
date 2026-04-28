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
    const items = buildOperisSlashMenuItems({ onCommand });

    expect(items.map((item) => [item.title, item.group])).toEqual(
      expect.arrayContaining([
        ['Decisão executiva', 'Operis'],
        ['Checklist comum', 'Estrutura'],
        ['Templates', 'Exportar'],
        ['Detalhes', 'Exportar'],
        ['Salvar', 'Exportar']
      ])
    );

    items.find((item) => item.title === 'Templates')?.onItemClick();
    items.find((item) => item.title === 'Detalhes')?.onItemClick();
    items.find((item) => item.title === 'Salvar')?.onItemClick();

    expect(onCommand).toHaveBeenCalledTimes(3);
    expect(onCommand).toHaveBeenNthCalledWith(1, 'templates');
    expect(onCommand).toHaveBeenNthCalledWith(2, 'details');
    expect(onCommand).toHaveBeenNthCalledWith(3, 'save');
  });
});
