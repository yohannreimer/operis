export type NoteArtifactSummary = {
  id: string;
  kind: 'diagram' | 'mindmap' | 'whiteboard';
  title: string | null;
};

export type NoteContentBlock = {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: NoteContentBlock[];
};

const artifactOrder: Record<NoteArtifactSummary['kind'], number> = {
  diagram: 0,
  mindmap: 1,
  whiteboard: 2
};

export function mergeArtifactReferences(
  blocks: NoteContentBlock[],
  artifacts: NoteArtifactSummary[]
): NoteContentBlock[] {
  const referencedArtifactIds = new Set(
    blocks.flatMap((block) => {
      const artifactId = block.props?.artifactId;
      return block.type === 'operisArtifact' && typeof artifactId === 'string' ? [artifactId] : [];
    })
  );

  const missingReferences = artifacts
    .filter((artifact) => !referencedArtifactIds.has(artifact.id))
    .sort((left, right) => artifactOrder[left.kind] - artifactOrder[right.kind])
    .map((artifact) => ({
      type: 'operisArtifact',
      props: {
        artifactId: artifact.id,
        artifactKind: artifact.kind,
        title: artifact.title ?? ''
      },
      content: []
    }));

  return [...blocks, ...missingReferences];
}
