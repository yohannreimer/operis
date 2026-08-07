# Notas Inline Artifact Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace attachment-like artifact cards with real read-only previews and guarantee an editable paragraph immediately after every artifact.

**Architecture:** Keep `operisArtifact` as a BlockNote reference block, but let its provider own note-scoped artifact loading and caching. Render the existing three canvas implementations in a compact read-only mode behind one lazy preview boundary. Normalize document blocks and insertion commands so every artifact is followed by exactly one normal paragraph that can receive focus.

**Tech Stack:** React 18, TypeScript, BlockNote, React Flow, Mind Elixir, Excalidraw, Vitest, Testing Library, Vite.

---

### Task 1: Normalize artifact continuation blocks

**Files:**
- Modify: `apps/web/src/features/notes/artifact-blocks.ts`
- Modify: `apps/web/src/features/notes/artifact-blocks.test.ts`

- [ ] **Step 1: Write the failing continuation tests**

Add tests that require a paragraph after adjacent and trailing artifact blocks, while preserving existing paragraphs:

```ts
it('places exactly one editable paragraph after every artifact', () => {
  const paragraph = { type: 'paragraph', content: [] } as OperisBlock;
  const adjacent = [
    createArtifactBlock(artifact),
    createArtifactBlock({ ...artifact, id: 'map-1', kind: 'mindmap' })
  ];

  const normalized = ensureArtifactContinuations(adjacent);

  expect(normalized.map((block) => block.type)).toEqual([
    'operisArtifact', 'paragraph', 'operisArtifact', 'paragraph'
  ]);
  expect(ensureArtifactContinuations([createArtifactBlock(artifact), paragraph])).toEqual([
    createArtifactBlock(artifact), paragraph
  ]);
  expect(ensureArtifactContinuations(normalized)).toEqual(normalized);
});
```

Update the merge test to expect the sequence artifact, paragraph, mind map, paragraph, whiteboard, paragraph.

- [ ] **Step 2: Run the helper test and verify it fails**

Run:

```bash
npm --workspace @execution-os/web test -- --run src/features/notes/artifact-blocks.test.ts
```

Expected: FAIL because `ensureArtifactContinuations` is not exported and merged artifacts do not receive paragraph blocks.

- [ ] **Step 3: Implement idempotent normalization**

Add a focused helper and call it from `mergeArtifactBlocks`:

```ts
function continuationParagraph(): OperisBlock {
  return { type: 'paragraph', content: [] } as OperisBlock;
}

export function ensureArtifactContinuations(blocks: OperisBlock[]): OperisBlock[] {
  return blocks.flatMap((block, index) => {
    if (!isArtifactBlock(block)) return [block];
    const next = blocks[index + 1];
    return next?.type === 'paragraph' ? [block] : [block, continuationParagraph()];
  });
}

export function mergeArtifactBlocks(blocks: OperisBlock[], artifacts: NoteArtifactSummary[]) {
  // Preserve the existing referenced/missing merge logic.
  return ensureArtifactContinuations([...blocks, ...missing]);
}
```

- [ ] **Step 4: Run the helper test and verify it passes**

Run the command from Step 2. Expected: all artifact block helper tests pass.

- [ ] **Step 5: Commit the continuation normalizer**

```bash
git add apps/web/src/features/notes/artifact-blocks.ts apps/web/src/features/notes/artifact-blocks.test.ts
git commit -m "fix(web): preserve writing after note artifacts"
```

### Task 2: Insert artifacts with a focused paragraph

**Files:**
- Modify: `apps/web/src/features/notes/note-document-editor.tsx`
- Modify: `apps/web/src/features/notes/notes-workspace.integration.test.tsx`

- [ ] **Step 1: Extend the integration test with continuation behavior**

After inserting a diagram, assert that the real BlockNote DOM contains an editable paragraph immediately after the artifact. Type through that paragraph before opening focus mode:

```ts
fireEvent.click(screen.getByRole('button', { name: 'Inserir no documento' }));
fireEvent.click(screen.getByRole('menuitem', { name: 'Diagrama' }));

const artifactBlock = document.querySelector('.note-artifact-block')?.closest('.bn-block');
const continuationBlock = artifactBlock?.nextElementSibling;
const continuation = continuationBlock?.querySelector<HTMLElement>('[contenteditable="true"]');
expect(continuation).not.toBeNull();
fireEvent.focus(continuation!);
fireEvent.input(continuation!, { target: { textContent: 'Próximos passos da reunião' } });
expect(await screen.findByText('Próximos passos da reunião')).toBeVisible();
```

Assert after returning from focus mode that the continuation text still appears once.

- [ ] **Step 2: Run the integration test and verify it fails**

```bash
npm --workspace @execution-os/web test -- --run src/features/notes/notes-workspace.integration.test.tsx
```

Expected: FAIL because insertion currently creates only `operisArtifact` and the external `+` does not provide a text block.

- [ ] **Step 3: Insert and focus a paragraph after the artifact**

Immediately after `insertOrUpdateBlockForSlashMenu`, insert a paragraph after the returned block and move the cursor into it:

```ts
const inserted = insertOrUpdateBlockForSlashMenu(
  editor,
  createArtifactBlock(artifact) as PartialBlock<any, any, any>
);
const [continuation] = editor.insertBlocks(
  [{ type: 'paragraph', content: [] }],
  inserted.id,
  'after'
);
emitDocument(editor);
editor.setTextCursorPosition(continuation.id, 'start');
```

Open focus mode only from the rendered preview. Remove the automatic `onOpenArtifact` call from insertion so the user remains in the note and can either write or open the artifact.

- [ ] **Step 4: Add the visible empty-paragraph cue**

In `apps/web/src/features/notes/notes.css`, scope a placeholder to empty paragraphs immediately following an artifact block:

```css
.bn-block:has(.note-artifact-block) + .bn-block .bn-inline-content:empty::before {
  color: var(--muted);
  content: 'Continue escrevendo…';
  pointer-events: none;
}
```

Replace the detached desktop `+` with a labeled “Inserir” action tied to the current editor selection. Keep the compact floating action on mobile with `aria-label="Inserir no documento"`.

- [ ] **Step 5: Run the integration and editor tests**

```bash
npm --workspace @execution-os/web test -- --run src/features/notes/notes-workspace.integration.test.tsx src/features/notes/editor
```

Expected: all selected tests pass and continuation text survives the round trip.

- [ ] **Step 6: Commit insertion behavior**

```bash
git add apps/web/src/features/notes/note-document-editor.tsx apps/web/src/features/notes/notes.css apps/web/src/features/notes/notes-workspace.integration.test.tsx
git commit -m "feat(web): continue writing after visual blocks"
```

### Task 3: Add note-scoped artifact loading and cache

**Files:**
- Modify: `apps/web/src/features/notes/artifact-block.tsx`
- Modify: `apps/web/src/features/notes/note-document-editor.tsx`
- Modify: `apps/web/src/features/notes/artifact-block.test.tsx`

- [ ] **Step 1: Write loading, success, and retry tests**

Mock only the API boundary and render the real provider/block:

```tsx
vi.spyOn(api, 'getNoteArtifact').mockResolvedValue({
  id: 'artifact-1',
  noteId: 'note-1',
  kind: 'diagram',
  title: 'Funil',
  data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
  editVersion: 1,
  createdAt: '2026-08-07T12:00:00.000Z',
  updatedAt: '2026-08-07T12:00:00.000Z'
});

render(
  <ArtifactBlockProvider noteId="note-1" onOpen={onOpen}>
    <ArtifactBlock artifactId="artifact-1" artifactKind="diagram" title="Funil" />
  </ArtifactBlockProvider>
);

expect(screen.getByRole('status', { name: 'Carregando diagrama Funil' })).toBeVisible();
expect(await screen.findByLabelText('Prévia do diagrama Funil')).toBeVisible();
expect(api.getNoteArtifact).toHaveBeenCalledTimes(1);
```

Add a rejection followed by success and assert “Tentar novamente” performs the second request.

- [ ] **Step 2: Run the artifact block test and verify it fails**

```bash
npm --workspace @execution-os/web test -- --run src/features/notes/artifact-block.test.tsx
```

Expected: FAIL because the provider does not accept `noteId` or load artifact detail.

- [ ] **Step 3: Implement the provider cache**

Extend the context with `loadArtifact(artifactId, force?)` and cache promises per mounted note:

```ts
type ArtifactBlockContextValue = {
  noteId: string;
  onOpen(artifactId: string): void;
  onDelete?(artifactId: string): void;
  loadArtifact(artifactId: string, force?: boolean): Promise<NoteArtifact>;
};

const cache = useRef(new Map<string, Promise<NoteArtifact>>());
const loadArtifact = useCallback((artifactId: string, force = false) => {
  if (force) cache.current.delete(artifactId);
  const current = cache.current.get(artifactId);
  if (current) return current;
  const request = api.getNoteArtifact(noteId, artifactId).catch((error) => {
    cache.current.delete(artifactId);
    throw error;
  });
  cache.current.set(artifactId, request);
  return request;
}, [noteId]);
```

Pass `noteId={note.id}` from `NoteDocumentEditor` and expose loading/error state from `ArtifactBlock`.

- [ ] **Step 4: Run the artifact block test and verify it passes**

Run the command from Step 2. Expected: loading, success, caching, and retry tests pass.

- [ ] **Step 5: Commit the loading boundary**

```bash
git add apps/web/src/features/notes/artifact-block.tsx apps/web/src/features/notes/artifact-block.test.tsx apps/web/src/features/notes/note-document-editor.tsx
git commit -m "feat(web): load inline note artifacts"
```

### Task 4: Render compact read-only previews

**Files:**
- Create: `apps/web/src/features/notes/artifact-preview.tsx`
- Create: `apps/web/src/features/notes/artifact-preview.test.tsx`
- Modify: `apps/web/src/features/notes/artifact-block.tsx`
- Modify: `apps/web/src/components/diagram-canvas.tsx`
- Modify: `apps/web/src/components/mindmap-canvas.tsx`
- Modify: `apps/web/src/components/whiteboard-canvas.tsx`
- Modify: `apps/web/src/features/notes/notes.css`

- [ ] **Step 1: Write preview dispatch tests**

Mock the three heavy canvas modules and assert kind-specific data, `readOnly`, and `preview` are forwarded:

```tsx
render(<ArtifactPreview artifact={diagramArtifact} />);
expect(screen.getByTestId('diagram-preview')).toHaveAttribute('data-read-only', 'true');
expect(screen.getByTestId('diagram-preview')).toHaveAttribute('data-preview', 'true');
```

Repeat for mind map and whiteboard, and assert the preview wrapper has `aria-label="Prévia do diagrama Funil"` and `inert` content beneath the single overlay edit action.

- [ ] **Step 2: Run the preview test and verify it fails**

```bash
npm --workspace @execution-os/web test -- --run src/features/notes/artifact-preview.test.tsx
```

Expected: FAIL because `ArtifactPreview` and compact canvas props do not exist.

- [ ] **Step 3: Implement the lazy preview dispatcher**

Create lazy imports for the three canvases and dispatch by artifact kind:

```tsx
const DiagramPreview = lazy(() => import('../../components/diagram-canvas').then((module) => ({ default: module.DiagramCanvas })));
const MindMapPreview = lazy(() => import('../../components/mindmap-canvas').then((module) => ({ default: module.MindMapCanvas })));
const WhiteboardPreview = lazy(() => import('../../components/whiteboard-canvas').then((module) => ({ default: module.WhiteboardCanvas })));

const shared = { onSave: async () => undefined, readOnly: true, preview: true };
```

Wrap the canvas in an inert, `aria-hidden` visual region and keep one semantic overlay button owned by `ArtifactBlock`.

- [ ] **Step 4: Add the `preview` canvas mode**

Add `preview?: boolean` to all three canvas prop types. In preview mode:

- diagram: hide toolbar, Controls, MiniMap, and attribution; disable pan, zoom, selection, dragging, and connections; fit content with generous padding;
- mind map: omit editor toolbar and prevent pointer/keyboard operations while retaining fitted content;
- whiteboard: enable view mode, hide Excalidraw menus/footer through the preview wrapper, and prevent the canvas from receiving focus or pointer events;
- every canvas: skip dirty/save registration caused by initialization.

The diagram condition should follow this concrete shape:

```tsx
{!preview ? <Controls /> : null}
{!preview ? <MiniMap ... /> : null}
<ReactFlow
  panOnDrag={!preview}
  zoomOnScroll={!preview}
  zoomOnPinch={!preview}
  preventScrolling={!preview}
  proOptions={{ hideAttribution: preview }}
/>
```

- [ ] **Step 5: Replace the attachment card with preview chrome**

Render a compact header above `ArtifactPreview`, followed by a full-width preview surface. Use “Editar em tela cheia” as the primary action and keep delete hidden until hover/focus. Add loading skeleton and compact retry state.

- [ ] **Step 6: Style desktop and mobile previews**

Use a 320 px desktop visual area and 220 px below 760 px. Remove the old icon-card grid and “Abrir” label styles. Keep the surface quiet: one border around the visual block, a flat header, no nested card backgrounds.

- [ ] **Step 7: Run component and integration tests**

```bash
npm --workspace @execution-os/web test -- --run src/features/notes/artifact-preview.test.tsx src/features/notes/artifact-block.test.tsx src/features/notes/notes-workspace.integration.test.tsx
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit inline previews**

```bash
git add apps/web/src/features/notes/artifact-preview.tsx apps/web/src/features/notes/artifact-preview.test.tsx apps/web/src/features/notes/artifact-block.tsx apps/web/src/features/notes/artifact-block.test.tsx apps/web/src/components/diagram-canvas.tsx apps/web/src/components/mindmap-canvas.tsx apps/web/src/components/whiteboard-canvas.tsx apps/web/src/features/notes/notes.css
git commit -m "feat(web): show visual artifacts inside notes"
```

### Task 5: Browser QA and final verification

**Files:**
- Modify only files implicated by a reproduced QA defect.

- [ ] **Step 1: Run the complete web checks**

```bash
npm --workspace @execution-os/web test
npm --workspace @execution-os/web run typecheck
npm --workspace @execution-os/web run build
git diff --check
```

Expected: every test passes, TypeScript exits 0, Vite produces the production bundle, and the diff check prints no errors.

- [ ] **Step 2: Verify desktop behavior in the in-app browser**

At `http://127.0.0.1:4174/notas/note-meeting-sales` verify:

1. Both seeded artifacts render real content inside the note.
2. The diagram and whiteboard expose one “Editar em tela cheia” action each.
3. “Continue escrevendo…” appears after each artifact.
4. Typing after the last artifact saves as normal note text.
5. Opening, editing, and returning refreshes the preview without leaving a false pending state.

- [ ] **Step 3: Verify mobile behavior**

Set the viewport to 390 × 844 and verify preview height, horizontal fit, readable title, visible continuation line, keyboard focus order, and access to the mobile “Inserir” action. Reset the viewport afterward.

- [ ] **Step 4: Commit any QA-only corrections**

If QA required changes, stage only those files and commit:

```bash
git commit -m "fix(web): polish inline artifact workflow"
```

If QA required no changes, do not create an empty commit.

- [ ] **Step 5: Confirm a clean branch**

```bash
git status --short
git log -5 --oneline
```

Expected: no unstaged or untracked changes and recent focused commits for continuation, loading, previews, and any QA correction.
