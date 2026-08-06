CREATE TYPE "DailyExecutionSource" AS ENUM ('inbox', 'task');

CREATE TABLE "daily_execution_items" (
  "id" TEXT NOT NULL,
  "clerk_user_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "source_type" "DailyExecutionSource" NOT NULL,
  "inbox_item_id" TEXT,
  "task_id" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_execution_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_execution_items_exactly_one_source_check"
    CHECK (("inbox_item_id" IS NOT NULL)::int + ("task_id" IS NOT NULL)::int = 1),
  CONSTRAINT "daily_execution_items_source_matches_check"
    CHECK (
      ("source_type" = 'inbox' AND "inbox_item_id" IS NOT NULL AND "task_id" IS NULL)
      OR
      ("source_type" = 'task' AND "task_id" IS NOT NULL AND "inbox_item_id" IS NULL)
    )
);

CREATE UNIQUE INDEX "daily_execution_items_user_date_inbox_key"
  ON "daily_execution_items"("clerk_user_id", "date", "inbox_item_id");
CREATE UNIQUE INDEX "daily_execution_items_user_date_task_key"
  ON "daily_execution_items"("clerk_user_id", "date", "task_id");
CREATE INDEX "daily_execution_items_user_date_position_idx"
  ON "daily_execution_items"("clerk_user_id", "date", "position");

ALTER TABLE "daily_execution_items"
  ADD CONSTRAINT "daily_execution_items_inbox_item_id_fkey"
  FOREIGN KEY ("inbox_item_id") REFERENCES "inbox_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_execution_items"
  ADD CONSTRAINT "daily_execution_items_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
