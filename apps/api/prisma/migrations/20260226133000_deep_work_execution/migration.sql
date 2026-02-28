-- CreateEnum
CREATE TYPE "DeepWorkState" AS ENUM ('active', 'completed', 'broken');

-- CreateTable
CREATE TABLE "deep_work_sessions" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "project_id" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "target_minutes" INTEGER NOT NULL DEFAULT 45,
  "actual_minutes" INTEGER NOT NULL DEFAULT 0,
  "interruption_count" INTEGER NOT NULL DEFAULT 0,
  "break_count" INTEGER NOT NULL DEFAULT 0,
  "state" "DeepWorkState" NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deep_work_sessions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "deep_work_sessions"
ADD CONSTRAINT "deep_work_sessions_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deep_work_sessions"
ADD CONSTRAINT "deep_work_sessions_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deep_work_sessions"
ADD CONSTRAINT "deep_work_sessions_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "deep_work_sessions_task_id_idx" ON "deep_work_sessions"("task_id");

-- CreateIndex
CREATE INDEX "deep_work_sessions_workspace_id_started_at_idx" ON "deep_work_sessions"("workspace_id", "started_at");

-- CreateIndex
CREATE INDEX "deep_work_sessions_state_idx" ON "deep_work_sessions"("state");
