DO $$
BEGIN
  CREATE TYPE "NoteType" AS ENUM (
    'inbox',
    'geral',
    'pessoas',
    'conteudo',
    'produto',
    'conclusao_tarefa',
    'referencia'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "notes" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT,
  "type" "NoteType" NOT NULL DEFAULT 'geral',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "workspace_id" TEXT,
  "project_id" TEXT,
  "task_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "notes"
    ADD CONSTRAINT "notes_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "notes"
    ADD CONSTRAINT "notes_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "notes"
    ADD CONSTRAINT "notes_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS "notes_type_updated_at_idx"
  ON "notes"("type", "updated_at");

CREATE INDEX IF NOT EXISTS "notes_workspace_id_updated_at_idx"
  ON "notes"("workspace_id", "updated_at");

CREATE INDEX IF NOT EXISTS "notes_project_id_updated_at_idx"
  ON "notes"("project_id", "updated_at");

CREATE INDEX IF NOT EXISTS "notes_task_id_updated_at_idx"
  ON "notes"("task_id", "updated_at");
