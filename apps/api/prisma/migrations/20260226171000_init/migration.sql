/*
  Warnings:

  - You are about to drop the column `action_items` on the `strategic_reviews` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "deep_work_sessions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "strategic_reviews" DROP COLUMN IF EXISTS "action_items";
ALTER TABLE "strategic_reviews" ADD COLUMN IF NOT EXISTS "actionItems" JSONB;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "weekly_energy_plans" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workspaces" ALTER COLUMN "updated_at" DROP DEFAULT;
