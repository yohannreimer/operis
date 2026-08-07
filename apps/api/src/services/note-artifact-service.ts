import type { NoteArtifact, NoteArtifactKind, Prisma, PrismaClient } from '@prisma/client';

import { accessibleNoteWhere } from './note-access-service.js';

export const MAX_NOTE_ARTIFACT_BYTES = 500 * 1024;

export class NoteArtifactServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message = code
  ) {
    super(message);
    this.name = 'NoteArtifactServiceError';
  }
}

type ArtifactCreateInput = {
  kind: NoteArtifactKind;
  title?: string | null;
  data: Prisma.InputJsonValue;
};

type ArtifactUpdateInput = {
  title?: string | null;
  data?: Prisma.InputJsonValue;
  baseVersion: number;
};

function validateArtifactData(data: Prisma.InputJsonValue): void {
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_NOTE_ARTIFACT_BYTES) {
    throw new NoteArtifactServiceError(
      'artifact_too_large',
      413,
      'O artefato ultrapassa o limite de 500 KB.'
    );
  }
}

export class NoteArtifactService {
  constructor(private readonly prisma: PrismaClient) {}

  private async requireAccessibleNote(userId: string, noteId: string): Promise<void> {
    const note = await this.prisma.note.findFirst({
      where: accessibleNoteWhere(userId, { id: noteId }),
      select: { id: true }
    });

    if (!note) {
      throw new NoteArtifactServiceError('note_not_found', 404, 'Nota não encontrada.');
    }
  }

  async list(userId: string, noteId: string): Promise<NoteArtifact[]> {
    await this.requireAccessibleNote(userId, noteId);
    return this.prisma.noteArtifact.findMany({
      where: { noteId },
      orderBy: { createdAt: 'asc' }
    });
  }

  async get(userId: string, noteId: string, artifactId: string): Promise<NoteArtifact> {
    await this.requireAccessibleNote(userId, noteId);
    const artifact = await this.prisma.noteArtifact.findFirst({ where: { id: artifactId, noteId } });

    if (!artifact) {
      throw new NoteArtifactServiceError('artifact_not_found', 404, 'Artefato não encontrado.');
    }

    return artifact;
  }

  async create(
    userId: string,
    noteId: string,
    input: ArtifactCreateInput
  ): Promise<NoteArtifact> {
    await this.requireAccessibleNote(userId, noteId);
    validateArtifactData(input.data);

    return this.prisma.noteArtifact.create({
      data: {
        noteId,
        kind: input.kind,
        title: input.title ?? null,
        data: input.data
      }
    });
  }

  async update(
    userId: string,
    noteId: string,
    artifactId: string,
    input: ArtifactUpdateInput
  ): Promise<NoteArtifact> {
    await this.requireAccessibleNote(userId, noteId);
    const existingArtifact = await this.prisma.noteArtifact.findFirst({
      where: { id: artifactId, noteId },
      select: { id: true }
    });

    if (!existingArtifact) {
      throw new NoteArtifactServiceError('artifact_not_found', 404, 'Artefato não encontrado.');
    }

    if (input.data !== undefined) validateArtifactData(input.data);

    const data: Prisma.NoteArtifactUpdateManyMutationInput = {
      editVersion: { increment: 1 }
    };
    if (input.title !== undefined) data.title = input.title;
    if (input.data !== undefined) data.data = input.data;

    const updated = await this.prisma.noteArtifact.updateMany({
      where: { id: artifactId, noteId, editVersion: input.baseVersion },
      data
    });

    if (updated.count === 0) {
      throw new NoteArtifactServiceError(
        'artifact_version_conflict',
        409,
        'Este artefato foi atualizado em outra sessão.'
      );
    }

    const artifact = await this.prisma.noteArtifact.findUnique({ where: { id: artifactId } });
    if (!artifact) {
      throw new NoteArtifactServiceError('artifact_not_found', 404, 'Artefato não encontrado.');
    }

    return artifact;
  }

  async remove(userId: string, noteId: string, artifactId: string): Promise<void> {
    await this.requireAccessibleNote(userId, noteId);
    const artifact = await this.prisma.noteArtifact.findFirst({
      where: { id: artifactId, noteId },
      select: { id: true }
    });

    if (!artifact) {
      throw new NoteArtifactServiceError('artifact_not_found', 404, 'Artefato não encontrado.');
    }

    await this.prisma.noteArtifact.delete({ where: { id: artifactId } });
  }
}
