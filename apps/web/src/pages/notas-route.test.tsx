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

  it('keeps artifact focus outside Layout', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const artifactRoute = source.indexOf('path="/notas/:noteId/artifacts/:artifactId"');
    const layoutStart = source.indexOf('<Route path="/" element={<Layout />}>');
    expect(artifactRoute).toBeGreaterThan(-1);
    expect(artifactRoute).toBeLessThan(layoutStart);
  });
});
