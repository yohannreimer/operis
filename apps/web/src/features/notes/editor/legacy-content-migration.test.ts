import { describe, expect, it } from 'vitest';
import { legacyContentToBlocks } from './legacy-content-migration';

describe('legacyContentToBlocks', () => {
  it('converts plain text paragraphs into BlockNote paragraph blocks', () => {
    expect(legacyContentToBlocks('Linha 1\n\nLinha 2')).toMatchObject([
      { type: 'paragraph', content: 'Linha 1' },
      { type: 'paragraph', content: 'Linha 2' }
    ]);
  });

  it('converts headings and checklist markdown into native blocks', () => {
    expect(legacyContentToBlocks('# Título\n- [ ] Fazer\n- [x] Feito')).toMatchObject([
      { type: 'heading', props: { level: 1 }, content: 'Título' },
      { type: 'checkListItem', props: { checked: false }, content: 'Fazer' },
      { type: 'checkListItem', props: { checked: true }, content: 'Feito' }
    ]);
  });

  it('strips simple HTML tags while preserving text', () => {
    expect(legacyContentToBlocks('<h2>Decisão</h2><p>Seguir</p>')).toMatchObject([
      { type: 'heading', props: { level: 2 }, content: 'Decisão' },
      { type: 'paragraph', content: 'Seguir' }
    ]);
  });
});
