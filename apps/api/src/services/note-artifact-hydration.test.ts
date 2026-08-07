import { describe, expect, it } from 'vitest';

import { mergeArtifactReferences } from './note-artifact-hydration.js';

const artifacts = [
  { id: 'a-diagram', kind: 'diagram' as const, title: 'Funil' },
  { id: 'a-map', kind: 'mindmap' as const, title: null },
  { id: 'a-board', kind: 'whiteboard' as const, title: null }
];

describe('mergeArtifactReferences', () => {
  it('appends missing references in diagram, mindmap, whiteboard order', () => {
    const result = mergeArtifactReferences(
      [{ id: 'p1', type: 'paragraph', content: 'Texto' }],
      [artifacts[2], artifacts[0], artifacts[1]]
    );

    expect(result.map((block) => block.type)).toEqual([
      'paragraph',
      'operisArtifact',
      'operisArtifact',
      'operisArtifact'
    ]);
    expect(result[1].props).toMatchObject({
      artifactId: 'a-diagram',
      artifactKind: 'diagram',
      title: 'Funil'
    });
  });

  it('is idempotent', () => {
    const once = mergeArtifactReferences([], artifacts);

    expect(mergeArtifactReferences(once, artifacts)).toEqual(once);
  });
});
