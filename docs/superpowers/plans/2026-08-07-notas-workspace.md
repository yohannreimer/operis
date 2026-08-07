# Notes Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic Notes experience with a responsive library, focused document editor, and full-screen embedded visual artifacts while preserving every existing note and canvas.

**Architecture:** Keep `Note` as the aggregate root and BlockNote as the ordered document model. Add one-to-many `NoteArtifact` records referenced by custom `operisArtifact` blocks, expose focused library/document/artifact routes, and split the current 6,900-line page into bounded feature modules. Preserve the legacy one-to-one canvas tables for fallback during the first production version and hydrate missing artifact blocks idempotently.

**Tech Stack:** React 18, React Router 6, TypeScript, Vite, Vitest, Testing Library, BlockNote, React Flow, Mind Elixir, Excalidraw, Fastify, Zod, Prisma 5, PostgreSQL.

**Design:** `docs/superpowers/specs/2026-08-07-notas-workspace-design.md`

---

## File map

### API and database

- Modify `apps/api/prisma/schema.prisma` — artifact, snapshot, and edit-version models.
- Create `apps/api/prisma/migrations/20260807000000_note_workspace_artifacts/migration.sql` — additive schema and idempotent legacy canvas backfill.
- Create `apps/api/src/services/note-artifact-service.ts` — artifact ownership, CRUD, size validation, and optimistic concurrency.
- Create `apps/api/src/services/note-artifact-service.test.ts` — service behavior.
- Create `apps/api/src/services/note-artifact-hydration.ts` — pure legacy-to-block merging.
- Create `apps/api/src/services/note-artifact-hydration.test.ts` — idempotency and ordering.
- Create `apps/api/src/routes/note-artifacts.ts` — artifact HTTP contract.
- Create `apps/api/src/routes/note-artifacts.test.ts` — route ownership and conflict behavior.
- Modify `apps/api/src/routes/notes.ts` — library/detail reads, edit-version conflict handling, artifact-aware checkpoints and restores.
- Create `apps/api/src/routes/notes-workspace.test.ts` — library, detail, checkpoint, restore, and conflict routes.
- Modify `apps/api/src/app.ts` — register artifact routes.

### Web data and domain

- Modify `apps/web/src/api.ts` — summaries, artifacts, edit versions, and endpoints.
- Create `apps/web/src/features/notes/types.ts` — UI-only state and contracts.
- Create `apps/web/src/features/notes/capture.ts` — deterministic quick-capture parsing and local draft key.
- Create `apps/web/src/features/notes/capture.test.ts` — capture semantics.
- Create `apps/web/src/features/notes/artifact-blocks.ts` — artifact block construction and hydration.
- Create `apps/web/src/features/notes/artifact-blocks.test.ts` — block insertion and idempotency.
- Create `apps/web/src/features/notes/use-note-save-state.ts` — debounced save state machine with retry.
- Create `apps/web/src/features/notes/use-note-save-state.test.tsx` — save/conflict/failure states.

### Web interface

- Create `apps/web/src/features/notes/quick-capture.tsx` and test — Enter capture, Shift+Enter, IME, retry.
- Create `apps/web/src/features/notes/use-notes-library.ts` and test — folders, filters, loading, search, and selection.
- Create `apps/web/src/features/notes/folder-filter-strip.tsx` — compact folder navigation.
- Create `apps/web/src/features/notes/notes-list.tsx` — dense note rows and states.
- Create `apps/web/src/features/notes/notes-library-page.tsx` and test — library composition.
- Create `apps/web/src/features/notes/note-document-editor.tsx` — focused BlockNote wrapper.
- Create `apps/web/src/features/notes/artifact-block.tsx` and test — lazy read-only preview and focus navigation.
- Create `apps/web/src/features/notes/note-details-panel.tsx` — folder, tags, type, and optional Operis links.
- Create `apps/web/src/features/notes/note-actions-menu.tsx` — pin, template, dictation, export, history, archive.
- Create `apps/web/src/features/notes/note-workspace-page.tsx` and test — document loading, autosave, and return anchor.
- Create `apps/web/src/features/notes/artifact-workspace-page.tsx` and test — full-screen canvas adapter.
- Create `apps/web/src/features/notes/notes.css` — desktop and mobile layouts.
- Modify `apps/web/src/features/notes/editor/operis-block-types.ts` — artifact block type.
- Modify `apps/web/src/features/notes/editor/operis-block-schema.tsx` — register `operisArtifact`.
- Modify `apps/web/src/features/notes/editor/operis-block-commands.tsx` and test — `/diagrama`, `/mapa` and `/quadro` commands.
- Modify `apps/web/src/features/notes/editor/operis-block-serializers.ts` and test — artifact text/HTML/export fallback.
- Replace `apps/web/src/pages/notas.tsx` — thin route coordinator only.
- Create `apps/web/src/pages/note-artifact.tsx` — full-screen route entry.
- Modify `apps/web/src/App.tsx` and `apps/web/src/components/layout.test.tsx` — place library/document inside the shell and artifact outside it.
- Modify `apps/web/src/demo/mock-fetch.ts` — realistic notes, folders, artifacts, and mutation behavior.

## Task 1: Lock the current Notes read contract with characterization tests

**Files:**
- Create: `apps/api/src/routes/notes-workspace.test.ts`

- [ ] **Step 1: Write an API characterization test for the existing Notes list**

Create a Fastify fixture matching the repository route-test pattern:

```ts
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getUserId } from '../middleware/auth.js';
import { registerNoteRoutes } from './notes.js';

vi.mock('../middleware/auth.js', () => ({ getUserId: vi.fn(() => 'user_1') }));

describe('notes workspace routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('lists the signed-in user notes in the current route', async () => {
    const prisma = {
      note: {
        findMany: vi.fn().mockResolvedValue([
          { id: '00000000-0000-4000-8000-000000000001', title: 'Funil', contentText: 'Resumo', folderId: null }
        ])
      }
    };
    const app = Fastify();
    registerNoteRoutes(app, prisma as never);
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/notes' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({ id: '00000000-0000-4000-8000-000000000001', title: 'Funil' })
    ]);
    expect(prisma.note.findMany).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the characterization test**

Run: `npm --workspace @execution-os/api test -- src/routes/notes-workspace.test.ts`

Expected: PASS against the existing `/notes` route.

- [ ] **Step 3: Run the existing native content tests as a baseline**

Run: `npm --workspace @execution-os/api test -- src/services/note-content-service.test.ts src/services/note-access-service.test.ts`

Expected: PASS. Record the test count in the task notes before changing routes or content normalization.

- [ ] **Step 4: Run the API typecheck baseline**

Run: `npm --workspace @execution-os/api run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the characterization tests**

```bash
git add apps/api/src/routes/notes-workspace.test.ts
git commit -m "test: characterize notes workspace cutover"
```

## Task 2: Implement deterministic quick-capture parsing

**Files:**
- Create: `apps/web/src/features/notes/capture.ts`
- Create: `apps/web/src/features/notes/capture.test.ts`

- [ ] **Step 1: Write the failing parser tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseQuickCapture } from './capture';

describe('parseQuickCapture', () => {
  it.each([
    ['Ideia curta', { title: 'Ideia curta', body: '' }],
    ['Primeira frase. Segunda frase.', { title: 'Primeira frase.', body: 'Segunda frase.' }],
    ['Título da reunião\nDecisões e próximos passos', { title: 'Título da reunião', body: 'Decisões e próximos passos' }]
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
```

- [ ] **Step 2: Run the parser test to verify failure**

Run: `npm --workspace @execution-os/web test -- src/features/notes/capture.test.ts`

Expected: FAIL because `capture.ts` does not exist.

- [ ] **Step 3: Implement the parser and stable local draft key**

```ts
export const QUICK_CAPTURE_DRAFT_KEY = 'operis.notes.quick-capture.draft';
export const QUICK_CAPTURE_TITLE_LIMIT = 96;

export function parseQuickCapture(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error('empty_capture');

  const firstLineBreak = value.indexOf('\n');
  const firstSentenceMatch = value.match(/^.*?[.!?](?:\s|$)/u);
  const sentenceEnd = firstSentenceMatch?.[0].trimEnd().length ?? Number.POSITIVE_INFINITY;
  const naturalEnd = Math.min(firstLineBreak < 0 ? Number.POSITIVE_INFINITY : firstLineBreak, sentenceEnd);
  const titleEnd = Math.min(Number.isFinite(naturalEnd) ? naturalEnd : value.length, QUICK_CAPTURE_TITLE_LIMIT);
  const title = value.slice(0, titleEnd).trim();
  const body = value.slice(titleEnd).replace(/^\s+/u, '').trim();

  return { title, body };
}
```

- [ ] **Step 4: Run the parser tests**

Run: `npm --workspace @execution-os/web test -- src/features/notes/capture.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the capture domain helper**

```bash
git add apps/web/src/features/notes/capture.ts apps/web/src/features/notes/capture.test.ts
git commit -m "feat(web): define quick note capture semantics"
```

## Task 3: Add the artifact and revision data model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260807000000_note_workspace_artifacts/migration.sql`

- [ ] **Step 1: Add Prisma models and edit versions**

Add the enum and relations:

```prisma
enum NoteArtifactKind {
  diagram
  mindmap
  whiteboard
}

model NoteArtifact {
  id           String           @id @default(uuid())
  noteId       String           @map("note_id")
  kind         NoteArtifactKind
  title        String?
  data         Json
  editVersion  Int              @default(1) @map("edit_version")
  legacySource String?          @map("legacy_source")
  legacyId     String?          @map("legacy_id")
  createdAt    DateTime         @default(now()) @map("created_at")
  updatedAt    DateTime         @updatedAt @map("updated_at")
  note         Note             @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@unique([legacySource, legacyId])
  @@index([noteId, updatedAt])
  @@map("note_artifacts")
}

model NoteArtifactRevision {
  id             String           @id @default(uuid())
  noteRevisionId String           @map("note_revision_id")
  artifactId     String           @map("artifact_id")
  kind           NoteArtifactKind
  title          String?
  data           Json
  editVersion    Int              @map("edit_version")
  createdAt      DateTime         @default(now()) @map("created_at")
  noteRevision   NoteRevision     @relation(fields: [noteRevisionId], references: [id], onDelete: Cascade)

  @@index([noteRevisionId])
  @@map("note_artifact_revisions")
}
```

Add `editVersion Int @default(1) @map("edit_version")` and `artifacts NoteArtifact[]` to `Note`. Add `artifactSnapshots NoteArtifactRevision[]` to `NoteRevision`.

- [ ] **Step 2: Write the additive migration**

The migration must create the enum/tables/indexes, add `notes.edit_version`, and backfill all three legacy tables. Use deterministic UUID-shaped IDs so rerunning the insert is harmless:

```sql
CREATE TYPE "NoteArtifactKind" AS ENUM ('diagram', 'mindmap', 'whiteboard');

ALTER TABLE "notes" ADD COLUMN "edit_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "note_artifacts" (
  "id" TEXT NOT NULL,
  "note_id" TEXT NOT NULL,
  "kind" "NoteArtifactKind" NOT NULL,
  "title" TEXT,
  "data" JSONB NOT NULL,
  "edit_version" INTEGER NOT NULL DEFAULT 1,
  "legacy_source" TEXT,
  "legacy_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "note_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "note_artifact_revisions" (
  "id" TEXT NOT NULL,
  "note_revision_id" TEXT NOT NULL,
  "artifact_id" TEXT NOT NULL,
  "kind" "NoteArtifactKind" NOT NULL,
  "title" TEXT,
  "data" JSONB NOT NULL,
  "edit_version" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "note_artifact_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "note_artifacts_legacy_source_legacy_id_key"
  ON "note_artifacts"("legacy_source", "legacy_id");
CREATE INDEX "note_artifacts_note_id_updated_at_idx"
  ON "note_artifacts"("note_id", "updated_at");
CREATE INDEX "note_artifact_revisions_note_revision_id_idx"
  ON "note_artifact_revisions"("note_revision_id");

ALTER TABLE "note_artifacts" ADD CONSTRAINT "note_artifacts_note_id_fkey"
  FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "note_artifact_revisions" ADD CONSTRAINT "note_artifact_revisions_note_revision_id_fkey"
  FOREIGN KEY ("note_revision_id") REFERENCES "note_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "note_artifacts" ("id", "note_id", "kind", "title", "data", "legacy_source", "legacy_id", "created_at", "updated_at")
SELECT substr(md5('diagram:' || d."id"), 1, 8) || '-' || substr(md5('diagram:' || d."id"), 9, 4) || '-4' || substr(md5('diagram:' || d."id"), 14, 3) || '-8' || substr(md5('diagram:' || d."id"), 18, 3) || '-' || substr(md5('diagram:' || d."id"), 21, 12),
       d."note_id", 'diagram', d."title", d."data", 'diagrams', d."id", d."created_at", d."updated_at"
FROM "diagrams" d
ON CONFLICT ("legacy_source", "legacy_id") DO NOTHING;

INSERT INTO "note_artifacts" ("id", "note_id", "kind", "title", "data", "legacy_source", "legacy_id", "created_at", "updated_at")
SELECT substr(md5('mindmap:' || m."id"), 1, 8) || '-' || substr(md5('mindmap:' || m."id"), 9, 4) || '-4' || substr(md5('mindmap:' || m."id"), 14, 3) || '-8' || substr(md5('mindmap:' || m."id"), 18, 3) || '-' || substr(md5('mindmap:' || m."id"), 21, 12),
       m."note_id", 'mindmap', m."title", m."data", 'mind_maps', m."id", m."created_at", m."updated_at"
FROM "mind_maps" m
ON CONFLICT ("legacy_source", "legacy_id") DO NOTHING;

INSERT INTO "note_artifacts" ("id", "note_id", "kind", "title", "data", "legacy_source", "legacy_id", "created_at", "updated_at")
SELECT substr(md5('whiteboard:' || w."id"), 1, 8) || '-' || substr(md5('whiteboard:' || w."id"), 9, 4) || '-4' || substr(md5('whiteboard:' || w."id"), 14, 3) || '-8' || substr(md5('whiteboard:' || w."id"), 18, 3) || '-' || substr(md5('whiteboard:' || w."id"), 21, 12),
       w."note_id", 'whiteboard', w."title", w."data", 'whiteboards', w."id", w."created_at", w."updated_at"
FROM "whiteboards" w
ON CONFLICT ("legacy_source", "legacy_id") DO NOTHING;
```

- [ ] **Step 3: Generate Prisma and validate the schema**

Run:

```bash
npm --workspace @execution-os/api run prisma:generate
npm --workspace @execution-os/api exec prisma validate -- --schema prisma/schema.prisma
```

Expected: Prisma client generation succeeds and schema validation reports that the schema is valid.

- [ ] **Step 4: Inspect the migration for destructive statements**

Run: `rg -n "DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE" apps/api/prisma/migrations/20260807000000_note_workspace_artifacts/migration.sql`

Expected: no matches.

- [ ] **Step 5: Commit the additive data model**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260807000000_note_workspace_artifacts/migration.sql
git commit -m "feat(api): add note artifact data model"
```

## Task 4: Build artifact hydration and CRUD services

**Files:**
- Create: `apps/api/src/services/note-artifact-hydration.ts`
- Create: `apps/api/src/services/note-artifact-hydration.test.ts`
- Create: `apps/api/src/services/note-artifact-service.ts`
- Create: `apps/api/src/services/note-artifact-service.test.ts`

- [ ] **Step 1: Write failing hydration tests**

```ts
import { describe, expect, it } from 'vitest';
import { mergeArtifactReferences } from './note-artifact-hydration.js';

const artifacts = [
  { id: 'a-diagram', kind: 'diagram' as const, title: 'Funil' },
  { id: 'a-map', kind: 'mindmap' as const, title: null },
  { id: 'a-board', kind: 'whiteboard' as const, title: null }
];

describe('mergeArtifactReferences', () => {
  it('appends missing references in diagram, mindmap, whiteboard order', () => {
    const result = mergeArtifactReferences([{ id: 'p1', type: 'paragraph', content: 'Texto' }], artifacts);
    expect(result.map((block) => block.type)).toEqual([
      'paragraph', 'operisArtifact', 'operisArtifact', 'operisArtifact'
    ]);
    expect(result[1].props).toMatchObject({ artifactId: 'a-diagram', artifactKind: 'diagram' });
  });

  it('is idempotent', () => {
    const once = mergeArtifactReferences([], artifacts);
    expect(mergeArtifactReferences(once, artifacts)).toEqual(once);
  });
});
```

- [ ] **Step 2: Implement the pure merge helper**

```ts
type ArtifactSummary = { id: string; kind: 'diagram' | 'mindmap' | 'whiteboard'; title: string | null };
type NoteBlock = { id?: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: NoteBlock[] };

const kindOrder = { diagram: 0, mindmap: 1, whiteboard: 2 } as const;

export function mergeArtifactReferences(blocks: NoteBlock[], artifacts: ArtifactSummary[]) {
  const referenced = new Set(
    blocks.flatMap((block) => block.type === 'operisArtifact' && typeof block.props?.artifactId === 'string'
      ? [block.props.artifactId]
      : [])
  );
  const missing = artifacts
    .filter((artifact) => !referenced.has(artifact.id))
    .sort((left, right) => kindOrder[left.kind] - kindOrder[right.kind])
    .map((artifact) => ({
      type: 'operisArtifact',
      props: { artifactId: artifact.id, artifactKind: artifact.kind, title: artifact.title ?? '' },
      content: []
    }));
  return [...blocks, ...missing];
}
```

- [ ] **Step 3: Write failing service tests for ownership, payload limit, and conflict**

Test `create`, `get`, `update`, and `remove` with a mocked Prisma client. The conflict assertion must be explicit:

```ts
await expect(service.update('user_1', noteId, artifactId, {
  data: { nodes: [] }, baseVersion: 3
})).rejects.toMatchObject({ code: 'artifact_version_conflict', statusCode: 409 });
```

- [ ] **Step 4: Implement `NoteArtifactService`**

Expose these methods and enforce a 500 KiB serialized `data` limit:

```ts
export type ArtifactWrite = {
  kind?: 'diagram' | 'mindmap' | 'whiteboard';
  title?: string | null;
  data?: Record<string, unknown>;
  baseVersion?: number;
};

export class NoteArtifactService {
  constructor(private readonly prisma: PrismaClient) {}

  list(clerkUserId: string, noteId: string): Promise<NoteArtifact[]>;
  get(clerkUserId: string, noteId: string, artifactId: string): Promise<NoteArtifact>;
  create(clerkUserId: string, noteId: string, input: Required<Pick<ArtifactWrite, 'kind' | 'data'>> & Pick<ArtifactWrite, 'title'>): Promise<NoteArtifact>;
  update(clerkUserId: string, noteId: string, artifactId: string, input: ArtifactWrite): Promise<NoteArtifact>;
  remove(clerkUserId: string, noteId: string, artifactId: string): Promise<void>;
}
```

Use `accessibleNoteWhere(clerkUserId, { id: noteId })` before every mutation. For update, call `noteArtifact.updateMany` with `{ id, noteId, editVersion: baseVersion }`, increment `editVersion`, and throw a typed 409 error when `count === 0` but the artifact still exists.

- [ ] **Step 5: Run and commit the services**

Run:

```bash
npm --workspace @execution-os/api test -- src/services/note-artifact-hydration.test.ts src/services/note-artifact-service.test.ts
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/services/note-artifact-hydration.ts apps/api/src/services/note-artifact-hydration.test.ts apps/api/src/services/note-artifact-service.ts apps/api/src/services/note-artifact-service.test.ts
git commit -m "feat(api): add note artifact services"
```

## Task 5: Expose artifact routes

**Files:**
- Create: `apps/api/src/routes/note-artifacts.ts`
- Create: `apps/api/src/routes/note-artifacts.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing route tests**

Cover:

```ts
it('creates two diagrams for the same note', async () => {
  const first = await app.inject({ method: 'POST', url: `/notes/${noteId}/artifacts`, payload: { kind: 'diagram', title: 'A', data: {} } });
  const second = await app.inject({ method: 'POST', url: `/notes/${noteId}/artifacts`, payload: { kind: 'diagram', title: 'B', data: {} } });
  expect(first.statusCode).toBe(201);
  expect(second.statusCode).toBe(201);
});

it('returns 409 for a stale artifact version', async () => {
  const response = await app.inject({ method: 'PATCH', url: `/notes/${noteId}/artifacts/${artifactId}`, payload: { data: {}, baseVersion: 1 } });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toMatchObject({ error: 'artifact_version_conflict' });
});
```

- [ ] **Step 2: Run the route test to verify failure**

Run: `npm --workspace @execution-os/api test -- src/routes/note-artifacts.test.ts`

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement and register the route contract**

Register:

```ts
GET    /notes/:noteId/artifacts
POST   /notes/:noteId/artifacts
GET    /notes/:noteId/artifacts/:artifactId
PATCH  /notes/:noteId/artifacts/:artifactId
DELETE /notes/:noteId/artifacts/:artifactId
```

Use Zod UUID params and these payload schemas:

```ts
const artifactKindSchema = z.enum(['diagram', 'mindmap', 'whiteboard']);
const artifactCreateSchema = z.object({
  kind: artifactKindSchema,
  title: z.string().trim().max(180).optional().nullable(),
  data: z.record(z.unknown()).default({})
});
const artifactUpdateSchema = z.object({
  title: z.string().trim().max(180).optional().nullable(),
  data: z.record(z.unknown()).optional(),
  baseVersion: z.number().int().positive()
}).refine((value) => value.title !== undefined || value.data !== undefined, {
  message: 'Informe título ou dados para atualizar.'
});
```

Map typed service errors to 404, 409, and 413 responses.

- [ ] **Step 4: Run route tests and API typecheck**

Run:

```bash
npm --workspace @execution-os/api test -- src/routes/note-artifacts.test.ts
npm --workspace @execution-os/api run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the routes**

```bash
git add apps/api/src/routes/note-artifacts.ts apps/api/src/routes/note-artifacts.test.ts apps/api/src/app.ts
git commit -m "feat(api): expose embedded note artifacts"
```

## Task 6: Add library/detail reads and optimistic note saves

**Files:**
- Modify: `apps/api/src/routes/notes.ts`
- Modify: `apps/api/src/routes/notes-workspace.test.ts`

- [ ] **Step 1: Extend failing tests for library, detail, and conflicts**

Add assertions that:

```ts
expect(libraryRow).toEqual(expect.objectContaining({
  id: noteId,
  title: 'Funil',
  excerpt: 'Resumo',
  editVersion: 1
}));
expect(libraryRow).not.toHaveProperty('contentBlocks');

expect(detail).toEqual(expect.objectContaining({
  id: noteId,
  contentBlocks: expect.any(Array),
  artifacts: expect.any(Array)
}));

expect(staleResponse.statusCode).toBe(409);
expect(staleResponse.json()).toMatchObject({ error: 'note_version_conflict' });
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm --workspace @execution-os/api test -- src/routes/notes-workspace.test.ts`

Expected: FAIL on missing DTOs and conflict response.

- [ ] **Step 3: Implement the new reads**

Add `GET /notes/library` before the generic note routes. Parse this query:

```ts
const noteLibraryQuerySchema = z.object({
  view: z.enum(['inbox', 'pinned', 'recent']).optional(),
  folderId: z.string().uuid().optional(),
  q: z.string().trim().max(160).optional(),
  type: z.nativeEnum(NoteType).optional(),
  updatedAfter: z.coerce.date().optional(),
  long: z.coerce.boolean().optional(),
  workspaceId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional()
});
```

`view=inbox` means `folderId: null`; `view=pinned` means `pinned: true`; a concrete `folderId` overrides the synthetic view. Search matches title, `contentText`, and tags case-insensitively. `long=true` applies a server-side text-length threshold of 2,000 characters. Select only list fields and derive `excerpt` from `contentText ?? content` with a 180-character limit.

Add `GET /notes/:noteId` returning the full note plus artifact summaries:

```ts
artifacts: {
  select: { id: true, kind: true, title: true, editVersion: true, updatedAt: true },
  orderBy: { createdAt: 'asc' }
}
```

Pass the stored `contentBlocks` and artifact summaries through `mergeArtifactReferences` before returning detail. Do not persist this lazy hydration during a read.

- [ ] **Step 4: Enforce optimistic note updates**

Add `baseVersion` to `noteUpdateSchema`. When content or metadata changes, update with:

```ts
const updateData = {
  title: payload.title?.trim(),
  content: payload.content === undefined && payload.contentBlocks === undefined ? undefined : nativeContent.content,
  contentBlocks: payload.contentBlocks === undefined ? undefined : nativeContent.contentBlocks as any,
  contentText: payload.contentText === undefined && payload.contentBlocks === undefined ? undefined : nativeContent.contentText,
  contentHtml: payload.contentHtml === undefined && payload.contentBlocks === undefined ? undefined : nativeContent.contentHtml,
  contentVersion: payload.contentVersion === undefined && payload.contentBlocks === undefined ? undefined : nativeContent.contentVersion,
  type: payload.type,
  tags: payload.tags,
  pinned: payload.pinned,
  folderId: payload.folderId,
  workspaceId: payload.workspaceId,
  projectId: payload.projectId,
  taskId: payload.taskId,
  archivedAt: payload.archived === undefined ? undefined : payload.archived ? new Date() : null,
  editVersion: { increment: 1 }
};
const result = await prisma.note.updateMany({
  where: { id: params.noteId, editVersion: payload.baseVersion },
  data: updateData
});
if (result.count === 0) {
  return reply.code(409).send({ error: 'note_version_conflict', message: 'A nota foi alterada em outra sessão.' });
}
```

Fetch and return the updated row after success. Existing callers without `baseVersion` remain supported only for `saveSource: 'system'` during the transition; all UI writes introduced by this plan send a base version.

- [ ] **Step 5: Run and commit**

Run:

```bash
npm --workspace @execution-os/api test -- src/routes/notes-workspace.test.ts src/services/note-content-service.test.ts
npm --workspace @execution-os/api run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/routes/notes.ts apps/api/src/routes/notes-workspace.test.ts
git commit -m "feat(api): add notes library and conflict-safe detail"
```

## Task 7: Make checkpoints include artifact snapshots

**Files:**
- Modify: `apps/api/src/routes/notes.ts`
- Modify: `apps/api/src/routes/notes-workspace.test.ts`

- [ ] **Step 1: Write failing checkpoint and restore tests**

The checkpoint test must assert nested snapshot creation:

```ts
expect(prisma.noteRevision.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    noteId,
    artifactSnapshots: {
      create: [expect.objectContaining({ artifactId, kind: 'diagram', data: { nodes: [] } })]
    }
  })
});
```

The restore test must assert a single `$transaction` restores the note, deletes current artifacts, recreates snapshot artifacts with their original IDs, and creates a `restore_backup` revision first.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm --workspace @execution-os/api test -- src/routes/notes-workspace.test.ts`

Expected: FAIL because revisions do not include artifacts.

- [ ] **Step 3: Extend snapshot creation**

Load current artifacts before calling `noteRevision.create`, then use:

```ts
artifactSnapshots: {
  create: artifacts.map((artifact) => ({
    artifactId: artifact.id,
    kind: artifact.kind,
    title: artifact.title,
    data: artifact.data,
    editVersion: artifact.editVersion
  }))
}
```

Include `artifactSnapshots` in revision reads.

- [ ] **Step 4: Restore document and artifacts transactionally**

Within the existing transaction:

1. snapshot the current note and artifacts with source `restore_backup`;
2. update the note and increment `editVersion`;
3. delete current `noteArtifact` rows for the note;
4. recreate rows from `revision.artifactSnapshots` using the stored `artifactId`;
5. return the restored note with artifact summaries.

- [ ] **Step 5: Run and commit**

Run:

```bash
npm --workspace @execution-os/api test -- src/routes/notes-workspace.test.ts
npm --workspace @execution-os/api run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/routes/notes.ts apps/api/src/routes/notes-workspace.test.ts
git commit -m "feat(api): snapshot note artifacts with revisions"
```

## Task 8: Add web API contracts and demo fixtures

**Files:**
- Modify: `apps/web/src/api.ts`
- Create: `apps/web/src/features/notes/types.ts`
- Modify: `apps/web/src/demo/mock-fetch.ts`
- Modify: `apps/web/src/demo/mock-fetch.test.ts`

- [ ] **Step 1: Write failing demo endpoint tests**

Assert that demo mode returns non-empty folders, library rows, note detail, and two artifacts for the sample meeting note. Also assert a PATCH increments `editVersion` and a stale PATCH returns 409.

- [ ] **Step 2: Add shared API types**

```ts
export type NoteArtifactKind = 'diagram' | 'mindmap' | 'whiteboard';

export type NoteArtifactSummary = {
  id: string;
  noteId: string;
  kind: NoteArtifactKind;
  title: string | null;
  editVersion: number;
  updatedAt: string;
};

export type NoteArtifact = NoteArtifactSummary & {
  data: Record<string, unknown>;
  createdAt: string;
};

export type NoteSummary = Pick<Note, 'id' | 'title' | 'type' | 'tags' | 'pinned' | 'folderId' | 'createdAt' | 'updatedAt'> & {
  excerpt: string;
  editVersion: number;
  folder?: Pick<NoteFolder, 'id' | 'name' | 'parentId'> | null;
};
```

Extend `Note` with `editVersion` and optional `artifacts` summaries.

- [ ] **Step 3: Add API client methods**

```ts
getNotesLibrary: (query?: {
  view?: 'inbox' | 'pinned' | 'recent';
  folderId?: string;
  q?: string;
  type?: NoteType;
  updatedAfter?: string;
  long?: boolean;
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
}) =>
  apiRequest<NoteSummary[]>(withQuery('/notes/library', query)),
getNote: (noteId: string) => apiRequest<Note>(`/notes/${noteId}`),
getNoteArtifacts: (noteId: string) => apiRequest<NoteArtifactSummary[]>(`/notes/${noteId}/artifacts`),
getNoteArtifact: (noteId: string, artifactId: string) =>
  apiRequest<NoteArtifact>(`/notes/${noteId}/artifacts/${artifactId}`),
createNoteArtifact: (noteId: string, input: { kind: NoteArtifactKind; title?: string | null; data: Record<string, unknown> }) =>
  apiRequest<NoteArtifact>(`/notes/${noteId}/artifacts`, { method: 'POST', body: JSON.stringify(input) }),
updateNoteArtifact: (noteId: string, artifactId: string, input: { title?: string | null; data?: Record<string, unknown>; baseVersion: number }) =>
  apiRequest<NoteArtifact>(`/notes/${noteId}/artifacts/${artifactId}`, { method: 'PATCH', body: JSON.stringify(input) }),
deleteNoteArtifact: (noteId: string, artifactId: string) =>
  apiRequest<void>(`/notes/${noteId}/artifacts/${artifactId}`, { method: 'DELETE' })
```

Add `baseVersion` to `updateNote` input.

- [ ] **Step 4: Build realistic mutable demo fixtures**

Create folders `Vendas`, `Produto`, and `Referências`; create the note `Reunião — funil de vendas`; create one diagram and one whiteboard. Route demo `GET`, `POST`, `PATCH`, and `DELETE` requests through in-memory arrays and return 409 when `baseVersion` is stale.

- [ ] **Step 5: Run and commit**

Run:

```bash
npm --workspace @execution-os/web test -- src/demo/mock-fetch.test.ts src/api.test.ts
npm --workspace @execution-os/web run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/api.ts apps/web/src/features/notes/types.ts apps/web/src/demo/mock-fetch.ts apps/web/src/demo/mock-fetch.test.ts
git commit -m "feat(web): add notes workspace data contracts"
```

## Task 9: Register the embedded artifact block

**Files:**
- Create: `apps/web/src/features/notes/artifact-blocks.ts`
- Create: `apps/web/src/features/notes/artifact-blocks.test.ts`
- Create: `apps/web/src/features/notes/artifact-block.tsx`
- Create: `apps/web/src/features/notes/artifact-block.test.tsx`
- Modify: `apps/web/src/features/notes/editor/operis-block-types.ts`
- Modify: `apps/web/src/features/notes/editor/operis-block-schema.tsx`
- Modify: `apps/web/src/features/notes/editor/operis-block-commands.tsx`
- Modify: `apps/web/src/features/notes/editor/operis-block-commands.test.ts`
- Modify: `apps/web/src/features/notes/editor/operis-block-serializers.ts`
- Modify: `apps/web/src/features/notes/editor/operis-block-serializers.test.ts`

- [ ] **Step 1: Write failing artifact block tests**

Cover builder, hydration, command presence, preview action, and export fallback:

```ts
expect(createArtifactBlock(artifact)).toEqual({
  type: 'operisArtifact',
  props: { artifactId: artifact.id, artifactKind: 'diagram', title: 'Funil' },
  content: []
});
expect(mergeArtifactBlocks(existing, [artifact])).toHaveLength(existing.length);
expect(serialized.text).toContain('[Diagrama: Funil]');
```

- [ ] **Step 2: Implement pure artifact block helpers**

Export `createArtifactBlock`, `mergeArtifactBlocks`, `artifactLabel`, and `isArtifactBlock`. Use the same ordering and idempotency rules as the API helper.

- [ ] **Step 3: Register `operisArtifact` in BlockNote**

Use a custom block with `content: 'none'` and prop schema:

```ts
propSchema: {
  artifactId: { default: '' },
  artifactKind: { default: 'diagram', values: ['diagram', 'mindmap', 'whiteboard'] },
  title: { default: '' }
}
```

Render `<ArtifactBlock>` and pass `artifactId`, `artifactKind`, `title`, and an `onOpen` callback supplied through a small React context owned by `NoteDocumentEditor`.

- [ ] **Step 4: Add slash commands and serialization**

Add three `Operis` menu items with Lucide `Workflow`, `Network`, and `PencilRuler` icons. Each invokes a callback command:

```ts
export type OperisEditorCommand =
  | 'templates'
  | 'details'
  | 'save'
  | 'insertDiagram'
  | 'insertMindmap'
  | 'insertWhiteboard';

export type OperisBlockCommandCallbacks = {
  onCommand?: (command: OperisEditorCommand, editor: BlockNoteEditor<any, any, any>) => void;
};
```

Change `callbackCommand` to receive the current editor and invoke `onCommand?.(command, editor)`. This gives `NoteDocumentEditor` the exact cursor location needed after the artifact record is created.

Serializer fallback must emit readable text/HTML but never serialize artifact JSON into the note body.

- [ ] **Step 5: Run and commit**

Run:

```bash
npm --workspace @execution-os/web test -- src/features/notes/artifact-blocks.test.ts src/features/notes/artifact-block.test.tsx src/features/notes/editor/operis-block-commands.test.ts src/features/notes/editor/operis-block-serializers.test.ts
npm --workspace @execution-os/web run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/features/notes/artifact-blocks.ts apps/web/src/features/notes/artifact-blocks.test.ts apps/web/src/features/notes/artifact-block.tsx apps/web/src/features/notes/artifact-block.test.tsx apps/web/src/features/notes/editor
git commit -m "feat(web): embed visual artifacts in note documents"
```

## Task 10: Build the quick capture and library controller

**Files:**
- Create: `apps/web/src/features/notes/quick-capture.tsx`
- Create: `apps/web/src/features/notes/quick-capture.test.tsx`
- Create: `apps/web/src/features/notes/use-notes-library.ts`
- Create: `apps/web/src/features/notes/use-notes-library.test.tsx`

- [ ] **Step 1: Write failing quick-capture interaction tests**

Test:

```tsx
fireEvent.change(input, { target: { value: 'Ideia nova' } });
fireEvent.keyDown(input, { key: 'Enter', shiftKey: false, isComposing: false });
await waitFor(() => expect(api.createNote).toHaveBeenCalledWith(expect.objectContaining({
  title: 'Ideia nova', contentBlocks: [], folderId: null
})));
expect(screen.getByText('Capturado')).toBeVisible();

fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
expect(api.createNote).not.toHaveBeenCalled();
```

Add a failure test that preserves the field and local draft and shows `Tentar novamente`.

- [ ] **Step 2: Implement `QuickCapture`**

Use a controlled `<textarea>`, `parseQuickCapture`, `api.createNote`, and `QUICK_CAPTURE_DRAFT_KEY`. Ignore Enter while `event.nativeEvent.isComposing`. Convert a non-empty parsed body with `legacyContentToBlocks` and `serializeNoteBlocks`; a title-only capture sends an empty block array. After success, clear storage and call `onCaptured(note)`. The status line uses `aria-live="polite"`.

- [ ] **Step 3: Write failing library-controller tests**

Mock `api.getNotesLibrary` and `api.getNoteFolders`. Assert:

- resource failures remain distinct;
- selecting Inbox sends `{ view: 'inbox' }` and no `folderId`;
- folder selection sends the selected UUID;
- search is debounced and preserves the last successful rows;
- a captured note is prepended without a full reload.

- [ ] **Step 4: Implement `useNotesLibrary`**

Return:

```ts
type NotesLibraryController = {
  rows: NoteSummary[];
  folders: NoteFolder[];
  selectedView: 'inbox' | 'pinned' | 'recent' | string;
  query: string;
  loading: boolean;
  notesError: string | null;
  foldersError: string | null;
  setSelectedView(value: string): void;
  setQuery(value: string): void;
  addCaptured(note: Note): void;
  reload(): Promise<void>;
};
```

- [ ] **Step 5: Run and commit**

Run:

```bash
npm --workspace @execution-os/web test -- src/features/notes/quick-capture.test.tsx src/features/notes/use-notes-library.test.tsx
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/features/notes/quick-capture.tsx apps/web/src/features/notes/quick-capture.test.tsx apps/web/src/features/notes/use-notes-library.ts apps/web/src/features/notes/use-notes-library.test.tsx
git commit -m "feat(web): add notes capture and library state"
```

## Task 11: Build the responsive Notes Library and move it into the app shell

**Files:**
- Create: `apps/web/src/features/notes/folder-filter-strip.tsx`
- Create: `apps/web/src/features/notes/notes-list.tsx`
- Create: `apps/web/src/features/notes/notes-library-page.tsx`
- Create: `apps/web/src/features/notes/notes-library-page.test.tsx`
- Create: `apps/web/src/features/notes/notes.css`
- Replace: `apps/web/src/pages/notas.tsx`
- Create: `apps/web/src/pages/notas-route.test.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write failing Library composition tests**

Assert the page contains one heading, capture, search, folders, and dense list; does not contain a permanent editor; and preserves resource-local errors:

```tsx
expect(screen.getByRole('heading', { name: 'Notas' })).toBeInTheDocument();
expect(screen.getByPlaceholderText('Capture uma ideia, frase ou lembrete…')).toBeInTheDocument();
expect(screen.getByRole('searchbox', { name: 'Buscar em notas' })).toBeInTheDocument();
expect(screen.getByRole('navigation', { name: 'Pastas de notas' })).toBeInTheDocument();
expect(screen.queryByRole('textbox', { name: 'Conteúdo da nota' })).not.toBeInTheDocument();
```

Create the route test with only the library/document requirement at this stage:

```tsx
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('notes route placement', () => {
  it('keeps library and document inside Layout', () => {
    const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const layoutStart = source.indexOf('<Route path="/" element={<Layout />}>');
    expect(source.indexOf('path="notas"')).toBeGreaterThan(layoutStart);
    expect(source.indexOf('path="notas/:noteId"')).toBeGreaterThan(layoutStart);
  });
});
```

- [ ] **Step 2: Implement folders and note rows**

`FolderFilterStrip` renders Inbox, Fixadas, Recentes, then top-level folders. `NotesList` renders semantic links to `/notas/:noteId` with title, excerpt, folder, and relative date. Empty states must distinguish no notes, no search result, and failed load.

- [ ] **Step 3: Compose `NotesLibraryPage`**

Use the approved order:

```tsx
<main className="notes-library-page">
  <NotesLibraryHeader />
  <div className="notes-library-content">
    <QuickCapture onCaptured={controller.addCaptured} onOpen={(note) => navigate(`/notas/${note.id}`)} />
    <FolderFilterStrip controller={controller} />
    <NotesList rows={controller.rows} loading={controller.loading} error={controller.notesError} onRetry={controller.reload} />
  </div>
</main>
```

- [ ] **Step 4: Replace the page and fix route placement**

Make `apps/web/src/pages/notas.tsx` a route coordinator using `useParams`:

```tsx
export function NotasPage() {
  const { noteId } = useParams<{ noteId?: string }>();
  return noteId ? <NoteWorkspacePage noteId={noteId} /> : <NotesLibraryPage />;
}
```

Move Notes inside the `Layout` route:

```tsx
<Route path="notas" element={<NotasPage />} />
<Route path="notas/:noteId" element={<NotasPage />} />
```

- [ ] **Step 5: Run and commit**

Run:

```bash
npm --workspace @execution-os/web test -- src/features/notes/notes-library-page.test.tsx src/pages/notas-route.test.tsx src/components/layout.test.tsx
npm --workspace @execution-os/web run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/features/notes/folder-filter-strip.tsx apps/web/src/features/notes/notes-list.tsx apps/web/src/features/notes/notes-library-page.tsx apps/web/src/features/notes/notes-library-page.test.tsx apps/web/src/features/notes/notes.css apps/web/src/pages/notas.tsx apps/web/src/App.tsx apps/web/src/pages/notas-route.test.tsx
git commit -m "feat(web): replace notes home with focused library"
```

## Task 12: Build conflict-safe document autosave and the focused editor

**Files:**
- Create: `apps/web/src/features/notes/use-note-save-state.ts`
- Create: `apps/web/src/features/notes/use-note-save-state.test.tsx`
- Create: `apps/web/src/features/notes/note-document-editor.tsx`
- Create: `apps/web/src/features/notes/note-details-panel.tsx`
- Create: `apps/web/src/features/notes/note-actions-menu.tsx`
- Create: `apps/web/src/features/notes/note-workspace-page.tsx`
- Create: `apps/web/src/features/notes/note-workspace-page.test.tsx`

- [ ] **Step 1: Write failing save-state tests**

Using fake timers, assert:

```ts
expect(result.current.status).toBe('dirty');
await vi.advanceTimersByTimeAsync(900);
expect(save).toHaveBeenCalledTimes(1);
expect(result.current.status).toBe('saved');
```

Reject with `{ status: 409 }` and assert `conflict`; reject with a network error and assert `failed`, local draft retention, and successful `retry()`.

- [ ] **Step 2: Implement the save state machine**

Use explicit states:

```ts
export type NoteSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict';
```

Store a serialized draft under `operis.notes.draft:<noteId>`. Debounce 900 ms. Every successful save replaces the local base version with the returned `editVersion` and clears the local draft. Do not auto-retry conflicts.

- [ ] **Step 3: Write failing workspace tests**

Assert:

- full note detail loads for the requested ID;
- legacy artifact summaries become blocks once, not twice;
- topbar shows `Salvando`, `Salvo`, `Não salvo`, or `Conflito`;
- returning from artifact focus scrolls and focuses `[data-block-id="<id>"]`;
- details and actions are closed by default;
- a missing note returns to `/notas` with an alert.

- [ ] **Step 4: Implement the document workspace**

`NoteDocumentEditor` wraps the existing `OperisBlockEditor` and owns `ArtifactBlockContext`. For insert commands:

1. call `api.createNoteArtifact` with an empty valid payload;
2. insert `createArtifactBlock(artifact)` at the cursor;
3. mark document dirty;
4. remove the artifact through the API if BlockNote insertion throws.

For deletion, delete the server artifact first and remove its BlockNote reference only after success. A failed delete leaves the intact preview and exposes retry, preventing a broken reference.

`NoteDetailsPanel` keeps folder, tags, type, workspace, project, and task. `NoteActionsMenu` keeps pin, templates, dictation, export, checkpoint/history, and archive. Port the existing handlers from `pages/notas.tsx` without changing their API semantics.

- [ ] **Step 5: Run and commit**

Run:

```bash
npm --workspace @execution-os/web test -- src/features/notes/use-note-save-state.test.tsx src/features/notes/note-workspace-page.test.tsx src/features/notes/editor
npm --workspace @execution-os/web run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/features/notes/use-note-save-state.ts apps/web/src/features/notes/use-note-save-state.test.tsx apps/web/src/features/notes/note-document-editor.tsx apps/web/src/features/notes/note-details-panel.tsx apps/web/src/features/notes/note-actions-menu.tsx apps/web/src/features/notes/note-workspace-page.tsx apps/web/src/features/notes/note-workspace-page.test.tsx
git commit -m "feat(web): add focused notes document workspace"
```

## Task 13: Build the full-screen artifact workspace

**Files:**
- Create: `apps/web/src/features/notes/artifact-workspace-page.tsx`
- Create: `apps/web/src/features/notes/artifact-workspace-page.test.tsx`
- Create: `apps/web/src/pages/note-artifact.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/notas-route.test.tsx`
- Modify: `apps/web/src/components/diagram-canvas.tsx`
- Modify: `apps/web/src/components/mindmap-canvas.tsx`
- Modify: `apps/web/src/components/whiteboard-canvas.tsx`

- [ ] **Step 1: Write failing full-screen route and adapter tests**

Assert:

```tsx
expect(screen.getByRole('main', { name: 'Editor visual em foco' })).toHaveClass('note-artifact-focus');
expect(screen.queryByText('Hoje')).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Voltar para a nota' })).toBeInTheDocument();
```

Extend `notas-route.test.tsx` in this task:

```tsx
it('keeps artifact focus outside Layout', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const artifactRoute = source.indexOf('path="/notas/:noteId/artifacts/:artifactId"');
  const layoutStart = source.indexOf('<Route path="/" element={<Layout />}>');
  expect(artifactRoute).toBeGreaterThan(-1);
  expect(artifactRoute).toBeLessThan(layoutStart);
});
```

Render each kind and verify the correct canvas adapter. Reject the save and verify `Alterações pendentes` plus a retry button.

- [ ] **Step 2: Make existing canvases reusable and flushable**

Add optional props shared by the adapters:

```ts
type CanvasSaveStateProps<TData extends Record<string, unknown>> = {
  onSave: (data: TData) => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
  registerFlush?: (flush: () => Promise<void>) => void;
  readOnly?: boolean;
};
```

Use `CanvasSaveStateProps<DiagramData>`, `CanvasSaveStateProps<MindMapData>`, and `CanvasSaveStateProps<WhiteboardData>` in the three components.

Remove window-level confirmation from the reusable canvas components; the workspace owns confirmation dialogs. Keep their native editing libraries and existing behavior.

- [ ] **Step 3: Implement `ArtifactWorkspacePage`**

Load the artifact by both `noteId` and `artifactId`, switch on `kind`, and debounce saves independently. Before navigating back, call the registered flush. Store the return anchor before leaving the note:

```ts
sessionStorage.setItem(`operis.notes.return:${noteId}`, JSON.stringify({ blockId: openerBlockId }));
```

On failed flush, keep the user in focus mode and show `Não foi possível salvar · Tentar novamente` and `Voltar com alterações pendentes`. The second action is allowed only because the draft is already in local storage.

- [ ] **Step 4: Add the top-level route outside `Layout`**

```tsx
const NoteArtifactPage = lazy(() => import('./pages/note-artifact').then((module) => ({ default: module.NoteArtifactPage })));

<Route path="/notas/:noteId/artifacts/:artifactId" element={<NoteArtifactPage />} />
```

Place it before `<Route path="/" element={<Layout />}>`. This guarantees that app sidebar and bottom navigation do not render in focus mode.

- [ ] **Step 5: Run and commit**

Run:

```bash
npm --workspace @execution-os/web test -- src/features/notes/artifact-workspace-page.test.tsx src/pages/notas-route.test.tsx
npm --workspace @execution-os/web run typecheck
```

Expected: PASS, including both route placement assertions.

Commit:

```bash
git add apps/web/src/features/notes/artifact-workspace-page.tsx apps/web/src/features/notes/artifact-workspace-page.test.tsx apps/web/src/pages/note-artifact.tsx apps/web/src/App.tsx apps/web/src/pages/notas-route.test.tsx apps/web/src/components/diagram-canvas.tsx apps/web/src/components/mindmap-canvas.tsx apps/web/src/components/whiteboard-canvas.tsx
git commit -m "feat(web): add full-screen note artifact workspace"
```

## Task 14: Preserve search, templates, history, export, dictation, and optional links

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/features/notes/note-details-panel.tsx`
- Modify: `apps/web/src/features/notes/note-actions-menu.tsx`
- Modify: `apps/web/src/features/notes/notes-library-page.tsx`
- Create: `apps/web/src/features/notes/note-secondary-actions.test.tsx`
- Modify: `apps/api/src/routes/note-artifacts.ts`
- Modify: `apps/api/src/routes/note-artifacts.test.ts`

- [ ] **Step 1: Write failing secondary-feature tests**

Assert:

- templates open only from `Nova nota` or the note action menu;
- revisions open only from the note action menu;
- export provides Copy, TXT, PDF, and WhatsApp;
- dictation remains reachable from `+` and the action menu;
- details edits folder/tags/type and optional workspace/project/task;
- related notes render after the document, collapsed by default;
- advanced search contains long notes and date filters instead of a permanent `Longas` navigation item.
- `Gerenciar pastas` preserves create, rename, archive, reorder, parent selection, and nested-folder navigation.

- [ ] **Step 2: Port secondary behavior into bounded components**

Move existing API calls and helpers from the old `pages/notas.tsx` into the two panels. Keep the following entry points:

```ts
type NoteActionsMenuProps = {
  note: Note;
  onPin(): Promise<void>;
  onOpenTemplates(): void;
  onOpenHistory(): void;
  onStartDictation(): void;
  onExport(format: 'copy' | 'txt' | 'pdf' | 'whatsapp'): Promise<void> | void;
  onArchive(): Promise<void>;
};
```

Move the existing nested-folder CRUD into the on-demand `Gerenciar pastas` surface reached from `FolderFilterStrip`. Do not restore fixed mode tabs or permanent side panels.

- [ ] **Step 3: Preserve AI diagram and mind-map generation as an on-demand action**

Add `POST /notes/:noteId/artifacts/generate` with body `{ kind: 'diagram' | 'mindmap', title?: string }`. Reuse `generateDiagram` and `generateMindMap`, create a new `NoteArtifact`, and return 422 for note text shorter than 50 characters. This route always creates a new artifact and never overwrites another artifact.

Add the matching client method:

```ts
generateNoteArtifact: (noteId: string, input: { kind: 'diagram' | 'mindmap'; title?: string }) =>
  apiRequest<NoteArtifact>(`/notes/${noteId}/artifacts/generate`, {
    method: 'POST',
    body: JSON.stringify(input)
  })
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm --workspace @execution-os/api test -- src/routes/note-artifacts.test.ts
npm --workspace @execution-os/web test -- src/features/notes/note-secondary-actions.test.tsx src/features/notes/notes-library-page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit secondary features**

```bash
git add apps/api/src/routes/note-artifacts.ts apps/api/src/routes/note-artifacts.test.ts apps/web/src/api.ts apps/web/src/features/notes/note-details-panel.tsx apps/web/src/features/notes/note-actions-menu.tsx apps/web/src/features/notes/notes-library-page.tsx apps/web/src/features/notes/note-secondary-actions.test.tsx
git commit -m "feat: preserve secondary notes workflows"
```

## Task 15: Finish responsive, accessibility, and visual behavior

**Files:**
- Modify: `apps/web/src/features/notes/notes.css`
- Modify: `apps/web/src/features/notes/quick-capture.tsx`
- Modify: `apps/web/src/features/notes/folder-filter-strip.tsx`
- Modify: `apps/web/src/features/notes/notes-list.tsx`
- Modify: `apps/web/src/features/notes/note-document-editor.tsx`
- Modify: `apps/web/src/features/notes/artifact-workspace-page.tsx`
- Create: `apps/web/src/features/notes/notes-accessibility.test.tsx`

- [ ] **Step 1: Write failing accessibility and responsive structure tests**

Assert:

- every icon-only button has an accessible name;
- status messages use `aria-live`;
- folders use navigation semantics;
- note rows are links;
- the artifact focus root owns `tabIndex={-1}` and receives focus;
- `Escape` returns only when no dialog is open;
- the mobile insert toolbar remains after the editor in DOM order.

- [ ] **Step 2: Implement desktop styles**

Use existing Operis tokens. Set:

```css
.notes-library-content { width: min(100% - 48px, 920px); margin-inline: auto; }
.note-document-paper { width: min(100% - 48px, 760px); margin-inline: auto; }
.note-artifact-focus { position: fixed; inset: 0; min-height: 100dvh; background: var(--bg); z-index: 1000; }
```

Keep folder filters compact, use row separators rather than card shadows, and show editor controls on selection or hover rather than permanently.

- [ ] **Step 3: Implement mobile styles**

At `max-width: 760px`:

- use 16 px horizontal padding;
- make library, document, and focus workspace one column;
- horizontally scroll folder filters without visible scrollbar;
- pin the compact insert toolbar above the safe area;
- use `100dvh` for the artifact canvas;
- keep touch targets at least 44 px.

- [ ] **Step 4: Respect focus and reduced motion**

Add visible `:focus-visible` rings using the existing orange token. Wrap transitions with:

```css
@media (prefers-reduced-motion: reduce) {
  .notes-library-page *, .note-document-page *, .note-artifact-focus * {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Run and commit**

Run:

```bash
npm --workspace @execution-os/web test -- src/features/notes/notes-accessibility.test.tsx src/features/notes
npm --workspace @execution-os/web run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/features/notes
git commit -m "style(web): finish responsive notes workspace"
```

## Task 16: Remove the old mode shell and verify the complete cutover

**Files:**
- Modify: `apps/web/src/pages/notas.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/demo/mock-fetch.ts`
- Create: `apps/web/src/features/notes/notes-workspace.integration.test.tsx`
- Modify: `docs/superpowers/specs/2026-08-07-notas-workspace-design.md` only if implementation revealed a factual mismatch.

- [ ] **Step 1: Write the end-to-end component integration test**

Mock only network calls and execute the real route flow with Testing Library:

```tsx
render(<NotesTestRouter initialEntries={['/notas']} />);

const capture = await screen.findByPlaceholderText('Capture uma ideia, frase ou lembrete…');
fireEvent.change(capture, { target: { value: 'Reunião — funil de vendas. Mapear diagnóstico.' } });
fireEvent.keyDown(capture, { key: 'Enter' });
fireEvent.click(await screen.findByRole('button', { name: 'Abrir nota capturada' }));

const editor = await screen.findByRole('textbox', { name: 'Conteúdo da nota' });
fireEvent.input(editor, { target: { textContent: 'Vamos mostrar o fluxo:' } });
fireEvent.keyDown(editor, { key: '/' });
fireEvent.click(await screen.findByRole('option', { name: /diagrama/i }));
fireEvent.click(await screen.findByRole('button', { name: /abrir funil.*em foco/i }));

fireEvent.click(await screen.findByTitle('Adicionar nó'));
fireEvent.click(await screen.findByRole('button', { name: 'Processo' }));
fireEvent.click(screen.getByRole('button', { name: 'Voltar para a nota' }));

expect(await screen.findByRole('button', { name: /abrir funil.*em foco/i })).toBeVisible();
expect(document.activeElement).toHaveAttribute('data-artifact-id');
```

Use actual components and a `MemoryRouter`; do not mock `QuickCapture`, `NoteDocumentEditor`, or `ArtifactWorkspacePage`.

- [ ] **Step 2: Delete obsolete page-level UI and CSS**

Remove from the old page implementation:

- permanent three-pane navigator/list/editor shell;
- `CanvasMode` state and fixed mode buttons;
- duplicated canvas loading states tied directly to the page;
- Notes-only duplicate sidebar/topbar;
- CSS selectors used only by the removed shell.

Keep exported helpers only when imported by a focused module; otherwise move them beside their consumer or delete them.

- [ ] **Step 3: Run the focused Notes suite**

Run:

```bash
npm --workspace @execution-os/api test -- src/routes/note-artifacts.test.ts src/routes/notes-workspace.test.ts src/services/note-artifact-hydration.test.ts src/services/note-artifact-service.test.ts src/services/note-content-service.test.ts
npm --workspace @execution-os/web test -- src/features/notes src/pages/notas-route.test.tsx src/demo/mock-fetch.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 4: Run repository-wide verification**

Run:

```bash
npm --workspace @execution-os/api test
npm --workspace @execution-os/web test
npm run typecheck
npm run build
npm --workspace @execution-os/api exec prisma validate -- --schema prisma/schema.prisma
git diff --check
```

Expected: all tests, typechecks, builds, Prisma validation, and whitespace checks pass.

- [ ] **Step 5: Rehearse migration and perform browser QA**

Against a disposable PostgreSQL database with copies of legacy diagram, mind-map, and whiteboard rows:

```bash
npm --workspace @execution-os/api exec prisma migrate deploy -- --schema prisma/schema.prisma
npm --workspace @execution-os/api exec prisma migrate status -- --schema prisma/schema.prisma
```

Expected: migration deploy succeeds, status is current, every legacy canvas has one `note_artifacts` row, and rerunning deploy creates no duplicates.

Run the demo app and verify `/notas`, `/notas/:noteId`, and `/notas/:noteId/artifacts/:artifactId` at desktop and mobile widths. Capture screenshots of Library, document, and artifact focus after interactions.

- [ ] **Step 6: Commit the cutover**

```bash
git add apps/web/src/pages/notas.tsx apps/web/src/styles.css apps/web/src/demo/mock-fetch.ts apps/web/src/features/notes/notes-workspace.integration.test.tsx docs/superpowers/specs/2026-08-07-notas-workspace-design.md
git commit -m "feat: complete notes workspace redesign"
```
