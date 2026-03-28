-- Add clerk_user_id to all tables that need user scoping
-- Existing rows get a placeholder value 'legacy' so NOT NULL constraint is satisfied
-- After deploy, populate real values via backfill if needed

-- DropIndex (changing unique constraints)
DROP INDEX IF EXISTS "day_plans_date_key";
DROP INDEX IF EXISTS "inbox_items_processed_idx";
DROP INDEX IF EXISTS "note_folders_archived_at_sort_order_idx";
DROP INDEX IF EXISTS "note_folders_parent_id_sort_order_idx";

-- workspaces
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "clerk_user_id" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "workspaces" ALTER COLUMN "clerk_user_id" DROP DEFAULT;

-- day_plans
ALTER TABLE "day_plans" ADD COLUMN IF NOT EXISTS "clerk_user_id" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "day_plans" ALTER COLUMN "clerk_user_id" DROP DEFAULT;

-- gamification_state
ALTER TABLE "gamification_state" ADD COLUMN IF NOT EXISTS "clerk_user_id" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "gamification_state" ALTER COLUMN "clerk_user_id" DROP DEFAULT;

-- habits
ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "clerk_user_id" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "habits" ALTER COLUMN "clerk_user_id" DROP DEFAULT;

-- inbox_items
ALTER TABLE "inbox_items" ADD COLUMN IF NOT EXISTS "clerk_user_id" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "inbox_items" ALTER COLUMN "clerk_user_id" DROP DEFAULT;

-- note_folders
ALTER TABLE "note_folders" ADD COLUMN IF NOT EXISTS "clerk_user_id" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "note_folders" ALTER COLUMN "clerk_user_id" DROP DEFAULT;

-- recurring_blocks
ALTER TABLE "recurring_blocks" ADD COLUMN IF NOT EXISTS "clerk_user_id" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "recurring_blocks" ALTER COLUMN "clerk_user_id" DROP DEFAULT;

-- Deduplicate day_plans: first remove items belonging to duplicate plans, then remove duplicates
DELETE FROM "day_plan_items" WHERE "day_plan_id" IN (
  SELECT id FROM "day_plans"
  WHERE id NOT IN (
    SELECT MIN(id) FROM "day_plans" GROUP BY "clerk_user_id", "date"
  )
);
DELETE FROM "day_plans"
WHERE id NOT IN (
  SELECT MIN(id) FROM "day_plans" GROUP BY "clerk_user_id", "date"
);

-- Deduplicate gamification_state before creating unique index
DELETE FROM "gamification_state"
WHERE id NOT IN (
  SELECT MIN(id) FROM "gamification_state" GROUP BY "clerk_user_id"
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workspaces_clerk_user_id_idx" ON "workspaces"("clerk_user_id");
CREATE INDEX IF NOT EXISTS "day_plans_clerk_user_id_idx" ON "day_plans"("clerk_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "day_plans_clerk_user_id_date_key" ON "day_plans"("clerk_user_id", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "gamification_state_clerk_user_id_key" ON "gamification_state"("clerk_user_id");
CREATE INDEX IF NOT EXISTS "habits_clerk_user_id_idx" ON "habits"("clerk_user_id");
CREATE INDEX IF NOT EXISTS "inbox_items_clerk_user_id_processed_idx" ON "inbox_items"("clerk_user_id", "processed");
CREATE INDEX IF NOT EXISTS "note_folders_clerk_user_id_parent_id_sort_order_idx" ON "note_folders"("clerk_user_id", "parent_id", "sort_order");
CREATE INDEX IF NOT EXISTS "note_folders_clerk_user_id_archived_at_sort_order_idx" ON "note_folders"("clerk_user_id", "archived_at", "sort_order");
CREATE INDEX IF NOT EXISTS "recurring_blocks_clerk_user_id_idx" ON "recurring_blocks"("clerk_user_id");
