ALTER TABLE "tasks" ADD COLUMN "next_step" TEXT;

ALTER TABLE "subtasks"
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "task_id" ORDER BY "id") - 1 AS "position"
  FROM "subtasks"
)
UPDATE "subtasks" AS target
SET "position" = ranked."position"
FROM ranked
WHERE target."id" = ranked."id";

CREATE INDEX "subtasks_task_id_position_idx"
  ON "subtasks"("task_id", "position");
