import { describe, expect, it } from 'vitest';

import {
  artifactLabel,
  createArtifactBlock,
  isArtifactBlock,
  mergeArtifactBlocks
} from './artifact-blocks';

const artifact = {
  id: 'artifact-1',
  noteId: 'note-1',
  kind: 'diagram' as const,
  title: 'Funil',
  editVersion: 1,
  updatedAt: '2026-08-07T12:00:00.000Z'
};

describe('artifact block helpers', () => {
  it('builds a portable embedded artifact reference', () => {
    expect(createArtifactBlock(artifact)).toEqual({
      type: 'operisArtifact',
      props: { artifactId: artifact.id, artifactKind: 'diagram', title: 'Funil' },
      content: []
    });
    expect(artifactLabel('diagram')).toBe('Diagrama');
    expect(isArtifactBlock(createArtifactBlock(artifact))).toBe(true);
  });

  it('hydrates missing artifacts once and in visual-tool order', () => {
    const existing = [createArtifactBlock(artifact)];
    const artifacts = [
      { ...artifact, id: 'board-1', kind: 'whiteboard' as const },
      artifact,
      { ...artifact, id: 'map-1', kind: 'mindmap' as const }
    ];
    const merged = mergeArtifactBlocks(existing, artifacts);

    expect(merged).toHaveLength(3);
    expect(merged.map((block) => block.props?.artifactId)).toEqual([
      'artifact-1',
      'map-1',
      'board-1'
    ]);
    expect(mergeArtifactBlocks(merged, artifacts)).toEqual(merged);
  });
});
