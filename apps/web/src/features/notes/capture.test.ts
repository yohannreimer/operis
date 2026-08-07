import { describe, expect, it } from 'vitest';

import { parseQuickCapture } from './capture';

describe('parseQuickCapture', () => {
  it.each([
    ['Ideia curta', { title: 'Ideia curta', body: '' }],
    ['Primeira frase. Segunda frase.', { title: 'Primeira frase.', body: 'Segunda frase.' }],
    [
      'Título da reunião\nDecisões e próximos passos',
      { title: 'Título da reunião', body: 'Decisões e próximos passos' }
    ]
  ])('splits %j without losing content', (input, expected) => {
    expect(parseQuickCapture(input)).toEqual(expected);
  });

  it('limits the title to 96 characters and moves overflow to the body', () => {
    const input = 'a'.repeat(110);
    const result = parseQuickCapture(input);

    expect(result.title).toHaveLength(96);
    expect(result.body).toBe('a'.repeat(14));
  });

  it('rejects whitespace-only capture', () => {
    expect(() => parseQuickCapture('   \n ')).toThrow('empty_capture');
  });
});
