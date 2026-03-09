CREATE TABLE IF NOT EXISTS "note_revisions" (
  "id" TEXT NOT NULL,
  "note_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT,
  "type" "NoteType" NOT NULL DEFAULT 'geral',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "folder_id" TEXT,
  "workspace_id" TEXT,
  "project_id" TEXT,
  "task_id" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "note_revisions_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "note_revisions"
    ADD CONSTRAINT "note_revisions_note_id_fkey"
    FOREIGN KEY ("note_id") REFERENCES "notes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS "note_revisions_note_id_created_at_idx"
  ON "note_revisions"("note_id", "created_at" DESC);
