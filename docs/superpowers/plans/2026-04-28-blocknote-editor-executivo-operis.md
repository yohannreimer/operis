# BlockNote Editor Executivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the handmade notes text editor with a native BlockNote-based Operis executive editor while preserving existing notes features and adding Operis-specific blocks.

**Architecture:** Store BlockNote blocks as the canonical note document in `contentBlocks`, with `contentText` and `contentHtml` as derived fields for search, export, IA, and compatibility. Keep `content` during migration as a legacy/fallback field. Encapsulate all editor logic under `apps/web/src/features/notes/editor` so `NotasPage` owns note selection/state and the editor owns document editing/serialization.

**Tech Stack:** React 18, Vite, TypeScript, Fastify, Prisma/PostgreSQL, BlockNote (`@blocknote/react`, `@blocknote/mantine`, `@blocknote/core`), Vitest for new pure module tests.

---

## Source Notes

BlockNote docs checked before planning:

- `useCreateBlockNote` creates the editor and `BlockNoteView` is uncontrolled, using `initialContent` and `onChange`.
- Custom blocks use `createReactBlockSpec`, `propSchema`, `content: "inline" | "none"`, and `render`.
- Slash menu customization uses `SuggestionMenuController` with `triggerCharacter="/"` and custom items.
- HTML export can use BlockNote format interoperability APIs such as `blocksToHTMLLossy`.

Use official docs while implementing:

- https://www.blocknotejs.org/docs/getting-started/editor-setup
- https://www.blocknotejs.org/docs/custom-schemas/custom-blocks
- https://www.blocknotejs.org/docs/react/components/suggestion-menus/
- https://www.blocknotejs.org/docs/foundations/supported-formats

---

## File Structure

### Backend

- Modify `apps/api/prisma/schema.prisma`
  - Add `contentBlocks`, `contentText`, `contentHtml`, `contentVersion` to `Note` and `NoteRevision`.
- Create `apps/api/prisma/migrations/20260428000000_note_block_content/migration.sql`
  - Adds nullable JSON/text derived fields and version defaults.
- Create `apps/api/src/services/note-content-service.ts`
  - Validation, normalization, serialized size checks, snapshot comparison helpers.
- Modify `apps/api/src/routes/notes.ts`
  - Accept and persist block fields.
  - Snapshot and restore block fields.
  - Search `contentText` with fallback to `content`.
- Modify `apps/api/src/services/canvas-ai-service.ts`
  - Prefer `note.contentText` for IA generation, falling back to legacy content extraction.

### Frontend API

- Modify `apps/web/src/api.ts`
  - Add `contentBlocks`, `contentText`, `contentHtml`, `contentVersion` to `Note`, `NoteRevision`, create/update payloads.

### Frontend Editor Module

- Create `apps/web/src/features/notes/editor/operis-block-types.ts`
  - Shared TypeScript types for block documents and editor values.
- Create `apps/web/src/features/notes/editor/legacy-content-migration.ts`
  - Convert legacy HTML/plain text/markdown-like snippets into BlockNote partial blocks.
- Create `apps/web/src/features/notes/editor/operis-block-serializers.ts`
  - Convert blocks to text, HTML, markdown, WhatsApp text.
- Create `apps/web/src/features/notes/editor/operis-block-templates.ts`
  - Native block versions of built-in note templates and snippets.
- Create `apps/web/src/features/notes/editor/operis-block-schema.tsx`
  - BlockNote schema and React renderers for Operis blocks.
- Create `apps/web/src/features/notes/editor/operis-block-commands.tsx`
  - Slash menu item builders and insertion helpers.
- Create `apps/web/src/features/notes/editor/operis-block-editor.tsx`
  - BlockNote editor wrapper used by notes page.
- Create `apps/web/src/features/notes/editor/index.ts`
  - Public exports.

### Frontend Integration

- Modify `apps/web/src/pages/notas.tsx`
  - Replace `contentEditable` editor with `OperisBlockEditor`.
  - Keep existing page features: metadata, templates panel, recording, history, export buttons, canvas modes.
  - Move text/content derivation to editor value.
- Modify `apps/web/src/styles.css`
  - Add BlockNote/Operis block styling matching the existing app.

### Tests

- Add Vitest config and scripts:
  - Modify `apps/web/package.json`
  - Modify `apps/api/package.json`
- Create `apps/web/src/features/notes/editor/legacy-content-migration.test.ts`
- Create `apps/web/src/features/notes/editor/operis-block-serializers.test.ts`
- Create `apps/api/src/services/note-content-service.test.ts`

---

## Task 1: Install Editor and Test Dependencies

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install BlockNote packages**

Run:

```bash
npm install @blocknote/core @blocknote/react @blocknote/mantine --workspace @execution-os/web
```

Expected: packages are added to `apps/web/package.json` and `package-lock.json`.

- [ ] **Step 2: Install Vitest for focused pure-module tests**

Run:

```bash
npm install -D vitest --workspace @execution-os/web
npm install -D vitest --workspace @execution-os/api
```

Expected: `vitest` appears in both workspace dev dependencies.

- [ ] **Step 3: Add test scripts**

In `apps/web/package.json`, add:

```json
"test": "vitest run"
```

In `apps/api/package.json`, add:

```json
"test": "vitest run"
```

Preserve existing scripts.

- [ ] **Step 4: Verify dependency graph**

Run:

```bash
npm install
npm run typecheck --workspace @execution-os/web
npm run typecheck --workspace @execution-os/api
```

Expected: both typechecks complete. If typecheck fails because BlockNote types require implementation files that do not exist yet, note the exact error and continue to Task 2.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/api/package.json package-lock.json
git commit -m "chore: add block editor dependencies"
```

---

## Task 2: Backend Block Content Data Model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260428000000_note_block_content/migration.sql`

- [ ] **Step 1: Update Prisma schema**

Add these fields to `model Note` after `content`:

```prisma
  contentBlocks  Json?   @map("content_blocks")
  contentText    String? @map("content_text")
  contentHtml    String? @map("content_html")
  contentVersion Int     @default(1) @map("content_version")
```

Add the same fields to `model NoteRevision` after `content`:

```prisma
  contentBlocks  Json?   @map("content_blocks")
  contentText    String? @map("content_text")
  contentHtml    String? @map("content_html")
  contentVersion Int     @default(1) @map("content_version")
```

- [ ] **Step 2: Create migration SQL**

Create `apps/api/prisma/migrations/20260428000000_note_block_content/migration.sql`:

```sql
ALTER TABLE "notes"
  ADD COLUMN IF NOT EXISTS "content_blocks" JSONB,
  ADD COLUMN IF NOT EXISTS "content_text" TEXT,
  ADD COLUMN IF NOT EXISTS "content_html" TEXT,
  ADD COLUMN IF NOT EXISTS "content_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "note_revisions"
  ADD COLUMN IF NOT EXISTS "content_blocks" JSONB,
  ADD COLUMN IF NOT EXISTS "content_text" TEXT,
  ADD COLUMN IF NOT EXISTS "content_html" TEXT,
  ADD COLUMN IF NOT EXISTS "content_version" INTEGER NOT NULL DEFAULT 1;
```

- [ ] **Step 3: Validate Prisma schema**

Run:

```bash
npx prisma validate --schema apps/api/prisma/schema.prisma
```

Expected: `The schema at apps/api/prisma/schema.prisma is valid`.

- [ ] **Step 4: Generate Prisma client**

Run:

```bash
npm run prisma:generate --workspace @execution-os/api
```

Expected: Prisma client generation completes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260428000000_note_block_content/migration.sql
git commit -m "feat: add native note block fields"
```

---

## Task 3: Backend Content Helpers and Tests

**Files:**
- Create: `apps/api/src/services/note-content-service.ts`
- Create: `apps/api/src/services/note-content-service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/services/note-content-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  hasNativeNoteSnapshotChanged,
  normalizeNativeNoteContent,
  validateBlockPayloadSize
} from './note-content-service';

describe('note-content-service', () => {
  it('normalizes native content and keeps legacy content compatible', () => {
    const result = normalizeNativeNoteContent({
      content: '<p>Legacy</p>',
      contentBlocks: [{ type: 'paragraph', content: 'Native' }],
      contentText: 'Native',
      contentHtml: '<p>Native</p>',
      contentVersion: 1
    });

    expect(result).toEqual({
      content: '<p>Native</p>',
      contentBlocks: [{ type: 'paragraph', content: 'Native' }],
      contentText: 'Native',
      contentHtml: '<p>Native</p>',
      contentVersion: 1
    });
  });

  it('falls back to legacy content when native fields are absent', () => {
    const result = normalizeNativeNoteContent({
      content: 'Plain note'
    });

    expect(result).toEqual({
      content: 'Plain note',
      contentBlocks: null,
      contentText: null,
      contentHtml: null,
      contentVersion: 1
    });
  });

  it('detects native block changes', () => {
    const changed = hasNativeNoteSnapshotChanged(
      {
        title: 'A',
        content: 'A',
        contentBlocks: [{ type: 'paragraph', content: 'A' }],
        contentText: 'A',
        contentHtml: '<p>A</p>',
        contentVersion: 1,
        type: 'geral',
        tags: [],
        pinned: false,
        folderId: null,
        workspaceId: null,
        projectId: null,
        taskId: null
      },
      {
        title: 'A',
        content: 'B',
        contentBlocks: [{ type: 'paragraph', content: 'B' }],
        contentText: 'B',
        contentHtml: '<p>B</p>',
        contentVersion: 1,
        type: 'geral',
        tags: [],
        pinned: false,
        folderId: null,
        workspaceId: null,
        projectId: null,
        taskId: null
      }
    );

    expect(changed).toBe(true);
  });

  it('rejects block payloads over the configured size', () => {
    expect(() => validateBlockPayloadSize([{ text: 'x'.repeat(1024) }], 100)).toThrow(
      'note_content_blocks_too_large'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test --workspace @execution-os/api -- src/services/note-content-service.test.ts
```

Expected: FAIL because `note-content-service.ts` does not exist.

- [ ] **Step 3: Implement helper**

Create `apps/api/src/services/note-content-service.ts`:

```ts
import { NoteType } from '@prisma/client';

export type NativeNoteContentInput = {
  content?: string | null;
  contentBlocks?: unknown | null;
  contentText?: string | null;
  contentHtml?: string | null;
  contentVersion?: number | null;
};

export type NativeNoteContent = {
  content: string | null;
  contentBlocks: unknown | null;
  contentText: string | null;
  contentHtml: string | null;
  contentVersion: number;
};

export type NativeNoteSnapshot = NativeNoteContent & {
  title: string;
  type: NoteType;
  tags: string[];
  pinned: boolean;
  folderId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  taskId: string | null;
};

export const MAX_NATIVE_BLOCK_BYTES = 1024 * 1024;

export function validateBlockPayloadSize(value: unknown, maxBytes = MAX_NATIVE_BLOCK_BYTES) {
  if (value === undefined || value === null) {
    return;
  }

  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > maxBytes) {
    throw new Error('note_content_blocks_too_large');
  }
}

export function normalizeNativeNoteContent(input: NativeNoteContentInput): NativeNoteContent {
  const hasBlocks = input.contentBlocks !== undefined && input.contentBlocks !== null;
  const contentHtml = input.contentHtml?.trim() ? input.contentHtml : null;
  const contentText = input.contentText?.trim() ? input.contentText : null;

  validateBlockPayloadSize(input.contentBlocks);

  return {
    content: hasBlocks ? contentHtml ?? contentText ?? input.content ?? null : input.content ?? null,
    contentBlocks: hasBlocks ? input.contentBlocks ?? null : null,
    contentText: hasBlocks ? contentText : null,
    contentHtml: hasBlocks ? contentHtml : null,
    contentVersion: Math.max(1, Math.floor(input.contentVersion ?? 1))
  };
}

export function normalizeStringArray(values?: string[]) {
  return Array.from(new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))).sort();
}

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function hasNativeNoteSnapshotChanged(current: NativeNoteSnapshot, next: NativeNoteSnapshot) {
  return (
    current.title !== next.title ||
    (current.content ?? null) !== (next.content ?? null) ||
    stableJson(current.contentBlocks) !== stableJson(next.contentBlocks) ||
    (current.contentText ?? null) !== (next.contentText ?? null) ||
    (current.contentHtml ?? null) !== (next.contentHtml ?? null) ||
    current.contentVersion !== next.contentVersion ||
    current.type !== next.type ||
    JSON.stringify(normalizeStringArray(current.tags)) !== JSON.stringify(normalizeStringArray(next.tags)) ||
    current.pinned !== next.pinned ||
    current.folderId !== next.folderId ||
    current.workspaceId !== next.workspaceId ||
    current.projectId !== next.projectId ||
    current.taskId !== next.taskId
  );
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test --workspace @execution-os/api -- src/services/note-content-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/note-content-service.ts apps/api/src/services/note-content-service.test.ts
git commit -m "feat: add native note content helpers"
```

---

## Task 4: Wire Backend Notes API

**Files:**
- Modify: `apps/api/src/routes/notes.ts`
- Modify: `apps/api/src/services/canvas-ai-service.ts`

- [ ] **Step 1: Import helpers**

In `apps/api/src/routes/notes.ts`, replace the local `normalizeStringArray` helper with imports:

```ts
import {
  hasNativeNoteSnapshotChanged,
  normalizeNativeNoteContent,
  normalizeStringArray
} from '../services/note-content-service.js';
```

- [ ] **Step 2: Extend schemas**

Add a reusable schema near `tagsSchema`:

```ts
const nativeContentSchema = {
  contentBlocks: z.unknown().optional().nullable(),
  contentText: z.string().max(500000).optional().nullable(),
  contentHtml: z.string().max(500000).optional().nullable(),
  contentVersion: z.number().int().min(1).max(20).optional()
};
```

Add `...nativeContentSchema` inside `noteCreateSchema` and `noteUpdateSchema`.

- [ ] **Step 3: Extend revision select**

Update `NOTE_REVISION_CORE_SELECT`:

```ts
const NOTE_REVISION_CORE_SELECT = {
  id: true,
  title: true,
  content: true,
  contentBlocks: true,
  contentText: true,
  contentHtml: true,
  contentVersion: true,
  type: true,
  tags: true,
  pinned: true,
  folderId: true,
  workspaceId: true,
  projectId: true,
  taskId: true
} as const;
```

- [ ] **Step 4: Update snapshot typing and creation**

Extend the `note` parameter for `createNoteRevisionSnapshot` with:

```ts
    contentBlocks: unknown | null;
    contentText: string | null;
    contentHtml: string | null;
    contentVersion: number;
```

Add to revision `data`:

```ts
      contentBlocks: note.contentBlocks as any,
      contentText: note.contentText,
      contentHtml: note.contentHtml,
      contentVersion: note.contentVersion,
```

- [ ] **Step 5: Normalize create payload**

Before `prisma.note.create`, add:

```ts
    const nativeContent = normalizeNativeNoteContent({
      content: payload.content ?? null,
      contentBlocks: payload.contentBlocks,
      contentText: payload.contentText ?? null,
      contentHtml: payload.contentHtml ?? null,
      contentVersion: payload.contentVersion
    });
```

Use in `data`:

```ts
        content: nativeContent.content,
        contentBlocks: nativeContent.contentBlocks as any,
        contentText: nativeContent.contentText,
        contentHtml: nativeContent.contentHtml,
        contentVersion: nativeContent.contentVersion,
```

- [ ] **Step 6: Normalize update payload and compare native snapshots**

Before `nextSnapshot`, add:

```ts
    const nativeContent = normalizeNativeNoteContent({
      content: payload.content === undefined ? current.content : payload.content,
      contentBlocks: payload.contentBlocks === undefined ? current.contentBlocks : payload.contentBlocks,
      contentText: payload.contentText === undefined ? current.contentText : payload.contentText,
      contentHtml: payload.contentHtml === undefined ? current.contentHtml : payload.contentHtml,
      contentVersion: payload.contentVersion === undefined ? current.contentVersion : payload.contentVersion
    });
```

Use `nativeContent` in `nextSnapshot` and replace `hasNoteSnapshotChanged` with `hasNativeNoteSnapshotChanged`.

In update `data`, add:

```ts
        content: payload.content === undefined && payload.contentBlocks === undefined ? undefined : nativeContent.content,
        contentBlocks: payload.contentBlocks === undefined ? undefined : (nativeContent.contentBlocks as any),
        contentText: payload.contentText === undefined && payload.contentBlocks === undefined ? undefined : nativeContent.contentText,
        contentHtml: payload.contentHtml === undefined && payload.contentBlocks === undefined ? undefined : nativeContent.contentHtml,
        contentVersion: payload.contentVersion === undefined && payload.contentBlocks === undefined ? undefined : nativeContent.contentVersion,
```

- [ ] **Step 7: Search derived text first**

In GET `/notes`, replace the content query block with:

```ts
                    { contentText: { contains: query.q, mode: 'insensitive' as const } },
                    { content: { contains: query.q, mode: 'insensitive' as const } },
```

- [ ] **Step 8: Restore native fields**

In restore update `data`, add:

```ts
          contentBlocks: revision.contentBlocks,
          contentText: revision.contentText,
          contentHtml: revision.contentHtml,
          contentVersion: revision.contentVersion ?? 1,
```

- [ ] **Step 9: Canvas IA uses derived text**

In `apps/api/src/services/canvas-ai-service.ts`, where note content is extracted, prefer `note.contentText ?? note.content ?? ''`. If the service only receives a string, update route callers in `apps/api/src/routes/canvas.ts` to pass `note.contentText ?? note.content ?? ''`.

- [ ] **Step 10: Verify backend**

Run:

```bash
npm test --workspace @execution-os/api
npm run typecheck --workspace @execution-os/api
```

Expected: tests pass and typecheck passes.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/routes/notes.ts apps/api/src/services/canvas-ai-service.ts apps/api/src/routes/canvas.ts
git commit -m "feat: persist native note blocks"
```

---

## Task 5: Frontend API Types

**Files:**
- Modify: `apps/web/src/api.ts`

- [ ] **Step 1: Add shared type**

Near `NoteType`, add:

```ts
export type NoteContentBlock = Record<string, unknown>;
```

- [ ] **Step 2: Extend Note and NoteRevision**

Add to `Note`:

```ts
  contentBlocks?: NoteContentBlock[] | null;
  contentText?: string | null;
  contentHtml?: string | null;
  contentVersion?: number;
```

Add the same fields to `NoteRevision`.

- [ ] **Step 3: Extend create/update payloads**

In `createNote` input, add:

```ts
    contentBlocks?: NoteContentBlock[] | null;
    contentText?: string | null;
    contentHtml?: string | null;
    contentVersion?: number;
```

In `updateNote` input partial, add:

```ts
      contentBlocks: NoteContentBlock[] | null;
      contentText: string | null;
      contentHtml: string | null;
      contentVersion: number;
```

- [ ] **Step 4: Verify web types**

Run:

```bash
npm run typecheck --workspace @execution-os/web
```

Expected: PASS or only failures from editor files not yet created. If failures come from this task, fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api.ts
git commit -m "feat: type native note block content"
```

---

## Task 6: Legacy Migration and Serializers

**Files:**
- Create: `apps/web/src/features/notes/editor/operis-block-types.ts`
- Create: `apps/web/src/features/notes/editor/legacy-content-migration.ts`
- Create: `apps/web/src/features/notes/editor/operis-block-serializers.ts`
- Create: `apps/web/src/features/notes/editor/legacy-content-migration.test.ts`
- Create: `apps/web/src/features/notes/editor/operis-block-serializers.test.ts`

- [ ] **Step 1: Write migration test**

Create `legacy-content-migration.test.ts`:

```ts
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
```

- [ ] **Step 2: Write serializer test**

Create `operis-block-serializers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { serializeNoteBlocks } from './operis-block-serializers';

describe('serializeNoteBlocks', () => {
  it('serializes common and Operis blocks to text and WhatsApp', () => {
    const result = serializeNoteBlocks([
      { type: 'heading', props: { level: 1 }, content: 'Reunião semanal' },
      { type: 'operisDecision', props: { title: 'Priorizar onboarding', reason: 'Ativação caiu', nextStep: 'Criar roteiro' } },
      { type: 'operisNextStep', props: { text: 'Enviar plano', status: 'open' } }
    ]);

    expect(result.text).toContain('Reunião semanal');
    expect(result.text).toContain('Decisão: Priorizar onboarding');
    expect(result.text).toContain('Próximo passo: Enviar plano');
    expect(result.whatsapp).toContain('*Reunião semanal*');
    expect(result.html).toContain('Priorizar onboarding');
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm test --workspace @execution-os/web -- src/features/notes/editor
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement types**

Create `operis-block-types.ts`:

```ts
export type OperisTaskStatus = 'open' | 'done';

export type OperisBlockType =
  | 'operisDecision'
  | 'operisNextStep'
  | 'operisRisk'
  | 'operisInsight'
  | 'operisMeeting'
  | 'operisExecutiveChecklist'
  | 'operisLinkedTask';

export type OperisBlock = {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: OperisBlock[];
};

export type SerializedNoteBlocks = {
  text: string;
  html: string;
  markdown: string;
  whatsapp: string;
};

export type OperisBlockEditorValue = SerializedNoteBlocks & {
  blocks: OperisBlock[];
};
```

- [ ] **Step 5: Implement migration**

Create `legacy-content-migration.ts` with deterministic parsing for headings, checklist, bullets, numbered items, and paragraphs:

```ts
import { OperisBlock } from './operis-block-types';

function stripHtml(raw: string) {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(h1|h2|h3|p|div|li)>/gi, '\n')
    .replace(/<h1[^>]*>/gi, '# ')
    .replace(/<h2[^>]*>/gi, '## ')
    .replace(/<h3[^>]*>/gi, '### ')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function legacyContentToBlocks(raw?: string | null): OperisBlock[] {
  const text = stripHtml(raw ?? '');
  if (!text.trim()) {
    return [{ type: 'paragraph', content: '' }];
  }

  return text
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): OperisBlock => {
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        return {
          type: 'heading',
          props: { level: heading[1].length },
          content: heading[2].trim()
        };
      }

      const checklist = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
      if (checklist) {
        return {
          type: 'checkListItem',
          props: { checked: checklist[1].toLowerCase() === 'x' },
          content: checklist[2].trim()
        };
      }

      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        return { type: 'bulletListItem', content: bullet[1].trim() };
      }

      const numbered = line.match(/^\d+[.)]\s+(.+)$/);
      if (numbered) {
        return { type: 'numberedListItem', content: numbered[1].trim() };
      }

      return { type: 'paragraph', content: line };
    });
}
```

- [ ] **Step 6: Implement serializers**

Create `operis-block-serializers.ts` with explicit handling for common and Operis block types:

```ts
import { OperisBlock, SerializedNoteBlocks } from './operis-block-types';

function inlineText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) return String((part as { text: unknown }).text ?? '');
        return '';
      })
      .join('');
  }
  return '';
}

function escapeHtml(raw: string) {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function props(block: OperisBlock) {
  return block.props ?? {};
}

function serializeBlock(block: OperisBlock) {
  const p = props(block);
  const text = inlineText(block.content);

  switch (block.type) {
    case 'heading': {
      const level = Number(p.level ?? 1);
      return {
        text,
        markdown: `${'#'.repeat(Math.max(1, Math.min(3, level)))} ${text}`,
        html: `<h${level}>${escapeHtml(text)}</h${level}>`,
        whatsapp: `*${text}*`
      };
    }
    case 'checkListItem': {
      const checked = Boolean(p.checked);
      return {
        text: `${checked ? '[x]' : '[ ]'} ${text}`,
        markdown: `- [${checked ? 'x' : ' '}] ${text}`,
        html: `<label><input type="checkbox"${checked ? ' checked' : ''} disabled> ${escapeHtml(text)}</label>`,
        whatsapp: `${checked ? '✅' : '⬜'} ${text}`
      };
    }
    case 'bulletListItem':
      return { text: `- ${text}`, markdown: `- ${text}`, html: `<ul><li>${escapeHtml(text)}</li></ul>`, whatsapp: `• ${text}` };
    case 'numberedListItem':
      return { text: `1. ${text}`, markdown: `1. ${text}`, html: `<ol><li>${escapeHtml(text)}</li></ol>`, whatsapp: `1. ${text}` };
    case 'operisDecision': {
      const title = String(p.title ?? text ?? '').trim();
      const reason = String(p.reason ?? '').trim();
      const nextStep = String(p.nextStep ?? '').trim();
      const lines = [`Decisão: ${title}`, reason ? `Motivo: ${reason}` : '', nextStep ? `Próximo passo: ${nextStep}` : ''].filter(Boolean);
      return {
        text: lines.join('\n'),
        markdown: `> ${lines.join('\n> ')}`,
        html: `<section data-operis-block="decision"><strong>Decisão:</strong> ${escapeHtml(title)}${reason ? `<p>Motivo: ${escapeHtml(reason)}</p>` : ''}${nextStep ? `<p>Próximo passo: ${escapeHtml(nextStep)}</p>` : ''}</section>`,
        whatsapp: `*Decisão:* ${title}${reason ? `\nMotivo: ${reason}` : ''}${nextStep ? `\nPróximo passo: ${nextStep}` : ''}`
      };
    }
    case 'operisNextStep': {
      const value = String(p.text ?? text ?? '').trim();
      const done = p.status === 'done';
      return {
        text: `Próximo passo: ${value}`,
        markdown: `- [${done ? 'x' : ' '}] ${value}`,
        html: `<section data-operis-block="next-step">${done ? 'Feito' : 'Aberto'}: ${escapeHtml(value)}</section>`,
        whatsapp: `${done ? '✅' : '⬜'} Próximo passo: ${value}`
      };
    }
    case 'operisRisk': {
      const risk = String(p.risk ?? text ?? '').trim();
      const impact = String(p.impact ?? '').trim();
      const mitigation = String(p.mitigation ?? '').trim();
      const lines = [`Risco: ${risk}`, impact ? `Impacto: ${impact}` : '', mitigation ? `Mitigação: ${mitigation}` : ''].filter(Boolean);
      return { text: lines.join('\n'), markdown: `> ${lines.join('\n> ')}`, html: `<section data-operis-block="risk">${lines.map(escapeHtml).join('<br>')}</section>`, whatsapp: lines.join('\n') };
    }
    case 'operisInsight': {
      const value = String(p.text ?? text ?? '').trim();
      return { text: `Insight: ${value}`, markdown: `> Insight: ${value}`, html: `<blockquote data-operis-block="insight">${escapeHtml(value)}</blockquote>`, whatsapp: `*Insight:* ${value}` };
    }
    case 'operisMeeting': {
      const title = String(p.title ?? 'Reunião').trim();
      const participants = String(p.participants ?? '').trim();
      const agenda = String(p.agenda ?? '').trim();
      const lines = [title, participants ? `Participantes: ${participants}` : '', agenda ? `Pauta: ${agenda}` : ''].filter(Boolean);
      return { text: lines.join('\n'), markdown: `## ${title}\n${lines.slice(1).join('\n')}`, html: `<section data-operis-block="meeting"><h2>${escapeHtml(title)}</h2>${lines.slice(1).map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</section>`, whatsapp: `*${title}*\n${lines.slice(1).join('\n')}` };
    }
    case 'operisExecutiveChecklist': {
      const label = String(p.label ?? 'Checklist executivo').trim();
      return { text: label, markdown: `### ${label}`, html: `<section data-operis-block="executive-checklist"><strong>${escapeHtml(label)}</strong></section>`, whatsapp: `*${label}*` };
    }
    case 'operisLinkedTask': {
      const title = String(p.title ?? text ?? '').trim();
      const status = String(p.status ?? '').trim();
      return { text: `Tarefa vinculada: ${title}`, markdown: `- Tarefa vinculada: ${title}`, html: `<section data-operis-block="linked-task">${escapeHtml(title)}${status ? ` · ${escapeHtml(status)}` : ''}</section>`, whatsapp: `Tarefa vinculada: ${title}` };
    }
    default:
      return { text, markdown: text, html: `<p>${escapeHtml(text)}</p>`, whatsapp: text };
  }
}

export function serializeNoteBlocks(blocks: OperisBlock[] = []): SerializedNoteBlocks {
  const rows = blocks.flatMap((block) => [serializeBlock(block), ...((block.children ?? []).map(serializeBlock))]);
  return {
    text: rows.map((row) => row.text).filter(Boolean).join('\n\n'),
    html: rows.map((row) => row.html).filter(Boolean).join('\n'),
    markdown: rows.map((row) => row.markdown).filter(Boolean).join('\n\n'),
    whatsapp: rows.map((row) => row.whatsapp).filter(Boolean).join('\n\n')
  };
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test --workspace @execution-os/web -- src/features/notes/editor
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/notes/editor
git commit -m "feat: add note block migration serializers"
```

---

## Task 7: BlockNote Schema, Commands, and Editor Component

**Files:**
- Create: `apps/web/src/features/notes/editor/operis-block-schema.tsx`
- Create: `apps/web/src/features/notes/editor/operis-block-commands.tsx`
- Create: `apps/web/src/features/notes/editor/operis-block-templates.ts`
- Create: `apps/web/src/features/notes/editor/operis-block-editor.tsx`
- Create: `apps/web/src/features/notes/editor/index.ts`

- [ ] **Step 1: Create schema**

Create custom block specs using `createReactBlockSpec` for:

```ts
operisDecision
operisNextStep
operisRisk
operisInsight
operisMeeting
operisExecutiveChecklist
operisLinkedTask
```

Each block must:

- Define stable props matching the serializers.
- Render with `contentRef` when inline editing is useful.
- Use CSS classes prefixed with `operis-block-`.

- [ ] **Step 2: Create commands**

Create slash menu items grouped as:

```ts
Operis
Estrutura
Exportar
```

Commands must insert:

- Decisão executiva.
- Próximo passo.
- Risco.
- Insight.
- Reunião.
- Checklist executivo.
- Tarefa vinculada.
- Checklist comum.
- Tabela.
- Retro.
- Data.

Commands for Templates, Detalhes and Salvar should call callbacks passed from `NotasPage`.

- [ ] **Step 3: Create native templates**

Create `operis-block-templates.ts` exporting:

```ts
import { OperisBlock } from './operis-block-types';

export type OperisBlockTemplate = {
  id: string;
  title: string;
  blocks: OperisBlock[];
};

export const OPERIS_BLOCK_SNIPPETS: Record<string, OperisBlock[]> = {
  decision: [{ type: 'operisDecision', props: { title: '', reason: '', nextStep: '' } }],
  retro: [
    { type: 'heading', props: { level: 2 }, content: 'Retro rápida' },
    { type: 'bulletListItem', content: 'Funcionou:' },
    { type: 'bulletListItem', content: 'Não funcionou:' },
    { type: 'bulletListItem', content: 'Ajuste:' }
  ],
  nextStep: [{ type: 'operisNextStep', props: { text: '', status: 'open' } }],
  risk: [{ type: 'operisRisk', props: { risk: '', impact: '', mitigation: '' } }],
  insight: [{ type: 'operisInsight', props: { text: '' } }],
  meeting: [
    { type: 'operisMeeting', props: { title: 'Reunião', participants: '', agenda: '' }, children: [] }
  ],
  executiveChecklist: [{ type: 'operisExecutiveChecklist', props: { label: 'Checklist executivo' } }]
};
```

- [ ] **Step 4: Create editor component**

`OperisBlockEditor` must:

- Use `useCreateBlockNote({ initialContent, schema })`.
- Render `BlockNoteView`.
- Render `SuggestionMenuController triggerCharacter="/"`.
- On change, emit `{ blocks, text, html, markdown, whatsapp }` using local serializers.
- Use `legacyContentToBlocks` when `initialBlocks` is missing.
- Recreate the editor when `noteId` changes.

- [ ] **Step 5: Export public API**

Create `index.ts`:

```ts
export * from './operis-block-types';
export * from './legacy-content-migration';
export * from './operis-block-serializers';
export * from './operis-block-templates';
export * from './operis-block-editor';
```

- [ ] **Step 6: Typecheck editor module**

Run:

```bash
npm run typecheck --workspace @execution-os/web
```

Expected: PASS. Fix all BlockNote type mismatches before continuing.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/notes/editor
git commit -m "feat: build operis block editor"
```

---

## Task 8: Integrate Editor into Notes Page

**Files:**
- Modify: `apps/web/src/pages/notas.tsx`

- [ ] **Step 1: Add native content state**

Add state:

```ts
const [contentBlocks, setContentBlocks] = useState<NoteContentBlock[] | null>(null);
const [contentText, setContentText] = useState('');
const [contentHtml, setContentHtml] = useState('');
const [contentMarkdown, setContentMarkdown] = useState('');
const [contentWhatsapp, setContentWhatsapp] = useState('');
```

Replace `contentPlain` memo with:

```ts
const contentPlain = useMemo(
  () => contentText || extractPlainText(contentHtml || content),
  [contentText, contentHtml, content]
);
```

- [ ] **Step 2: Extend editor snapshot**

Add to `EditorSnapshot`:

```ts
  contentBlocks: NoteContentBlock[] | null;
  contentText: string;
  contentHtml: string;
```

Update `hasUnsavedChanges` to compare serialized `contentBlocks`, `contentText`, and `contentHtml`.

- [ ] **Step 3: Populate state on note selection**

When `selectedNote` changes:

```ts
contentBlocks: selectedNote.contentBlocks ?? null,
contentText: selectedNote.contentText ?? extractPlainText(selectedNote.content ?? ''),
contentHtml: selectedNote.contentHtml ?? normalizeEditorContent(selectedNote.content ?? '')
```

Set all new state values.

- [ ] **Step 4: Replace `contentEditable` block**

Replace the `notes-writer-editor-wrap` contentEditable with:

```tsx
<OperisBlockEditor
  noteId={selectedNote.id}
  initialBlocks={contentBlocks}
  legacyContent={selectedNote.content ?? ''}
  onChange={(value) => {
    setContentBlocks(value.blocks);
    setContentText(value.text);
    setContentHtml(value.html);
    setContentMarkdown(value.markdown);
    setContentWhatsapp(value.whatsapp);
    setContent(value.html);
  }}
  onCommand={(command) => {
    if (command === 'templates') setTemplatesOpen(true);
    if (command === 'details') setWriterMetaOpen((current) => !current);
    if (command === 'save') void saveNoteChanges({ source: 'manual' });
  }}
/>
```

Remove code paths that rely on `writerRichEditorRef`, `document.execCommand`, custom slash state, and textarea caret positioning after all references are replaced.

- [ ] **Step 5: Update save payload**

In `saveNoteChanges`, send:

```ts
        content: contentHtml || contentText || null,
        contentBlocks,
        contentText: contentText || null,
        contentHtml: contentHtml || null,
        contentVersion: 1,
```

- [ ] **Step 6: Update export helpers**

Change:

- TXT export to use `contentText || contentMarkdown || extractPlainTextWithBreaks(content)`.
- PDF export to use `contentHtml || normalizeEditorContent(content)`.
- WhatsApp export to use `contentWhatsapp || getWhatsAppExportBody()`.

- [ ] **Step 7: Update templates and transcription insertion**

When appending template or transcript, use editor command callbacks when possible. If direct insertion is too large for first pass, convert the appended string to blocks via `legacyContentToBlocks`, merge with `contentBlocks`, and let `OperisBlockEditor` remount by changing a local editor revision key.

- [ ] **Step 8: Verify notes page types**

Run:

```bash
npm run typecheck --workspace @execution-os/web
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/pages/notas.tsx
git commit -m "feat: integrate block editor into notes"
```

---

## Task 9: Styling and Visual QA

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Import BlockNote styles**

In `operis-block-editor.tsx` or `main.tsx`, import:

```ts
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
```

- [ ] **Step 2: Add Operis block styles**

Add CSS classes:

```css
.operis-block-card {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.34);
  padding: 12px 14px;
}

.operis-block-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.operis-block-title {
  font-weight: 700;
  color: var(--text-primary);
}

.operis-block-muted {
  color: var(--text-muted);
}

.notes-writer-editor-wrap .bn-container {
  background: transparent;
  color: inherit;
}
```

Adjust exact CSS variables to match existing `styles.css` names.

- [ ] **Step 3: Run app locally**

Run:

```bash
npm run dev:web
```

Expected: Vite starts and prints a local URL.

- [ ] **Step 4: Browser QA**

Open the app and verify:

- A legacy note opens in the Text tab.
- Slash menu appears with Operis commands.
- Each Operis block can be inserted.
- Diagrama tab still opens.
- Mapa Mental tab still opens.
- Lousa tab still opens.
- Fullscreen still works.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles.css apps/web/src/features/notes/editor/operis-block-editor.tsx
git commit -m "style: polish operis block editor"
```

---

## Task 10: End-to-End Verification and Cleanup

**Files:**
- Review all changed files.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test --workspace @execution-os/api
npm test --workspace @execution-os/web
```

Expected: PASS.

- [ ] **Step 2: Run workspace typechecks**

Run:

```bash
npm run typecheck --workspaces
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build --workspaces
```

Expected: all workspaces build. If worker fails from unrelated existing issues, capture exact output and still verify `@execution-os/api` and `@execution-os/web` individually.

- [ ] **Step 4: Manual regression checklist**

Verify in the browser:

- Create note.
- Edit note.
- Autosave.
- Manual save.
- Create checkpoint.
- Restore revision.
- Apply built-in template.
- Apply custom template.
- Record/transcribe audio if webhook is configured.
- Export TXT.
- Export PDF.
- Copy WhatsApp.
- Search by text inside a native note.
- Generate diagram from text.
- Generate mind map from text.
- Open lousa.

- [ ] **Step 5: Inspect dirty worktree**

Run:

```bash
git status --short
```

Expected: only intentional changes remain. Do not revert pre-existing unrelated changes, including deleted Excalidraw locale assets or `apps/web/tsconfig.tsbuildinfo`.

- [ ] **Step 6: Final commit if needed**

If verification fixes were made, stage the implementation files that can be touched by this plan:

```bash
git add apps/api apps/web package-lock.json package.json
git commit -m "fix: stabilize operis block editor"
```

---

## Self-Review

### Spec Coverage

- Native BlockNote storage: Tasks 2, 3, 4, 5.
- Legacy compatibility: Tasks 4, 6, 8.
- Operis blocks: Tasks 6, 7, 9.
- Existing integrations preserved: Tasks 8, 10.
- Canvas/IA derived text: Tasks 4, 8, 10.
- History/restoration: Tasks 2, 4, 10.
- Export/search/related notes: Tasks 4, 6, 8, 10.
- Visual QA: Task 9.

### Completion Scan

The plan uses concrete file paths, commands, code snippets, and verification points. BlockNote API details are constrained by the official docs listed in Source Notes and verified by Task 7 typecheck.

### Type Consistency

The plan consistently uses:

- `contentBlocks`
- `contentText`
- `contentHtml`
- `contentVersion`
- `OperisBlockEditorValue`
- `serializeNoteBlocks`
- `legacyContentToBlocks`
- `OperisBlockEditor`
