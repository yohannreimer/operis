import { lazy, Suspense, useEffect, useRef } from 'react';

import type { DiagramData, MindMapData, NoteArtifact, WhiteboardData } from '../../api';
import { artifactLabel } from './artifact-blocks';

const DiagramPreview = lazy(() => import('../../components/diagram-canvas').then((module) => ({ default: module.DiagramCanvas })));
const MindMapPreview = lazy(() => import('../../components/mindmap-canvas').then((module) => ({ default: module.MindMapCanvas })));
const WhiteboardPreview = lazy(() => import('../../components/whiteboard-canvas').then((module) => ({ default: module.WhiteboardCanvas })));

export function ArtifactPreview({ artifact }: { artifact: NoteArtifact }) {
  const label = artifactLabel(artifact.kind).toLocaleLowerCase('pt-BR');
  const title = artifact.title?.trim() || `Novo ${label}`;
  const inertRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inertRef.current?.setAttribute('inert', '');
  }, []);

  return (
    <div className={`note-artifact-preview-canvas preview-${artifact.kind}`} aria-label={`Prévia do ${label} ${title}`}>
      <div ref={inertRef} className="note-artifact-preview-inert" aria-hidden="true">
        <Suspense fallback={<div className="note-artifact-preview-skeleton" />}>
          {artifact.kind === 'diagram' ? (
            <DiagramPreview
              initialData={artifact.data as unknown as DiagramData}
              onSave={async () => undefined}
              readOnly
              preview
            />
          ) : null}
          {artifact.kind === 'mindmap' ? (
            <MindMapPreview
              initialData={artifact.data as unknown as MindMapData}
              onSave={async () => undefined}
              readOnly
              preview
            />
          ) : null}
          {artifact.kind === 'whiteboard' ? (
            <WhiteboardPreview
              initialData={artifact.data as unknown as WhiteboardData}
              onSave={async () => undefined}
              readOnly
              preview
            />
          ) : null}
        </Suspense>
      </div>
    </div>
  );
}
