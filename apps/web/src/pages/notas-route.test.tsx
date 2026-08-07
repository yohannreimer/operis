import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('notes route placement', () => {
  it('keeps library and document inside Layout', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const layoutStart = source.indexOf('<Route path="/" element={<Layout />}>');
    expect(source.indexOf('path="notas"')).toBeGreaterThan(layoutStart);
    expect(source.indexOf('path="notas/:noteId"')).toBeGreaterThan(layoutStart);
  });
});
