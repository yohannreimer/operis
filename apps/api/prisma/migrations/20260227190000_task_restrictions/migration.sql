DO $$
BEGIN
  CREATE TYPE "TaskRestrictionStatus" AS ENUM ('aberta', 'resolvida');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "task_restrictions" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "status" "TaskRestrictionStatus" NOT NULL DEFAULT 'aberta',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "task_restrictions_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "task_restrictions"
    ADD CONSTRAINT "task_restrictions_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS "task_restrictions_task_id_idx"
  ON "task_restrictions"("task_id");

CREATE INDEX IF NOT EXISTS "task_restrictions_task_id_status_idx"
  ON "task_restrictions"("task_id", "status");

CREATE INDEX IF NOT EXISTS "task_restrictions_status_idx"
  ON "task_restrictions"("status");
