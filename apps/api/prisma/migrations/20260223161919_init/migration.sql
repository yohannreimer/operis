-- CreateEnum
CREATE TYPE "TaskHorizon" AS ENUM ('active', 'future');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "horizon" "TaskHorizon" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "tasks_horizon_idx" ON "tasks"("horizon");
