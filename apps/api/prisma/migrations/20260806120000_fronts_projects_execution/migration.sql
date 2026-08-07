CREATE TYPE "ProjectNextMoveSource" AS ENUM ('manual', 'recommendation');
CREATE TYPE "ProjectNextMoveStatus" AS ENUM ('active', 'resolved');
CREATE TYPE "ResponsibilityHealth" AS ENUM ('healthy', 'attention', 'critical');
CREATE TYPE "ResponsibilityStatus" AS ENUM ('active', 'paused', 'archived');
CREATE TYPE "ResponsibilityCadence" AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'custom');

ALTER TABLE "projects"
  ADD COLUMN "creation_key" TEXT;

CREATE TABLE "project_next_moves" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "task_id" TEXT,
  "idempotency_key" TEXT,
  "text" TEXT NOT NULL,
  "source" "ProjectNextMoveSource" NOT NULL,
  "reason" TEXT,
  "rule_key" TEXT,
  "status" "ProjectNextMoveStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "project_next_moves_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "responsibilities" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "expected_standard" TEXT NOT NULL,
  "cadence" "ResponsibilityCadence" NOT NULL,
  "cadence_interval_days" INTEGER,
  "health" "ResponsibilityHealth" NOT NULL DEFAULT 'healthy',
  "next_care" TEXT NOT NULL,
  "next_review_at" TIMESTAMP(3) NOT NULL,
  "last_reviewed_at" TIMESTAMP(3),
  "status" "ResponsibilityStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "responsibilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "responsibility_reviews" (
  "id" TEXT NOT NULL,
  "responsibility_id" TEXT NOT NULL,
  "created_task_id" TEXT,
  "health" "ResponsibilityHealth" NOT NULL,
  "note" TEXT,
  "next_care" TEXT NOT NULL,
  "next_review_at" TIMESTAMP(3) NOT NULL,
  "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "responsibility_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projects_workspace_id_creation_key_key"
  ON "projects"("workspace_id", "creation_key");
CREATE UNIQUE INDEX "project_next_moves_idempotency_key_key"
  ON "project_next_moves"("idempotency_key");
CREATE UNIQUE INDEX "project_next_moves_one_active_per_project"
  ON "project_next_moves"("project_id") WHERE "status" = 'active';
CREATE INDEX "project_next_moves_project_id_status_idx"
  ON "project_next_moves"("project_id", "status");
CREATE INDEX "project_next_moves_task_id_idx"
  ON "project_next_moves"("task_id");
CREATE INDEX "responsibilities_workspace_id_status_next_review_at_idx"
  ON "responsibilities"("workspace_id", "status", "next_review_at");
CREATE INDEX "responsibility_reviews_responsibility_id_reviewed_at_idx"
  ON "responsibility_reviews"("responsibility_id", "reviewed_at");

ALTER TABLE "project_next_moves" ADD CONSTRAINT "project_next_moves_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_next_moves" ADD CONSTRAINT "project_next_moves_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "responsibilities" ADD CONSTRAINT "responsibilities_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "responsibility_reviews" ADD CONSTRAINT "responsibility_reviews_responsibility_id_fkey"
  FOREIGN KEY ("responsibility_id") REFERENCES "responsibilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
