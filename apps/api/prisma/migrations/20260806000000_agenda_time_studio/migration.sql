-- Extend planned blocks so captures can be scheduled without task conversion.
ALTER TABLE "day_plan_items"
  ADD COLUMN "inbox_item_id" TEXT,
  ADD COLUMN "completed_at" TIMESTAMP(3);

ALTER TABLE "day_plan_items"
  ADD CONSTRAINT "day_plan_items_inbox_item_id_fkey"
  FOREIGN KEY ("inbox_item_id") REFERENCES "inbox_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "day_plan_items_day_plan_id_idx";
CREATE INDEX "day_plan_items_day_plan_id_start_time_idx"
  ON "day_plan_items"("day_plan_id", "start_time");
CREATE INDEX "day_plan_items_inbox_item_id_idx"
  ON "day_plan_items"("inbox_item_id");

-- Generic observed execution remains separate from strategic Deep Work.
CREATE TYPE "ExecutionSessionState" AS ENUM ('active', 'completed', 'cancelled');

CREATE TABLE "execution_sessions" (
  "id" TEXT NOT NULL,
  "clerk_user_id" TEXT NOT NULL,
  "day_plan_item_id" TEXT,
  "daily_execution_item_id" TEXT,
  "task_id" TEXT,
  "inbox_item_id" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "state" "ExecutionSessionState" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "execution_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "execution_sessions" ADD CONSTRAINT "execution_sessions_day_plan_item_id_fkey"
  FOREIGN KEY ("day_plan_item_id") REFERENCES "day_plan_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "execution_sessions" ADD CONSTRAINT "execution_sessions_daily_execution_item_id_fkey"
  FOREIGN KEY ("daily_execution_item_id") REFERENCES "daily_execution_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "execution_sessions" ADD CONSTRAINT "execution_sessions_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "execution_sessions" ADD CONSTRAINT "execution_sessions_inbox_item_id_fkey"
  FOREIGN KEY ("inbox_item_id") REFERENCES "inbox_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "execution_sessions_one_active_per_user_idx"
  ON "execution_sessions"("clerk_user_id") WHERE "state" = 'active';
CREATE INDEX "execution_sessions_clerk_user_id_started_at_idx"
  ON "execution_sessions"("clerk_user_id", "started_at");
CREATE INDEX "execution_sessions_day_plan_item_id_idx"
  ON "execution_sessions"("day_plan_item_id");
CREATE INDEX "execution_sessions_daily_execution_item_id_idx"
  ON "execution_sessions"("daily_execution_item_id");
CREATE INDEX "execution_sessions_task_id_idx"
  ON "execution_sessions"("task_id");
CREATE INDEX "execution_sessions_inbox_item_id_idx"
  ON "execution_sessions"("inbox_item_id");
