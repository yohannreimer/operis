import type { Prisma } from '@prisma/client';

export function accessibleNoteWhere(
  clerkUserId: string,
  extra?: Prisma.NoteWhereInput
): Prisma.NoteWhereInput {
  return {
    ...extra,
    AND: [
      ...(Array.isArray(extra?.AND) ? extra.AND : extra?.AND ? [extra.AND] : []),
      {
        OR: [
          { workspace: { clerkUserId } },
          { workspaceId: null, folder: { clerkUserId } },
          { workspaceId: null, folderId: null, clerkUserId }
        ]
      }
    ]
  };
}
