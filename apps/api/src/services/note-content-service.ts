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
    contentBlocks: hasBlocks ? input.contentBlocks : null,
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
