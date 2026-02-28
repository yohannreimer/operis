-- CreateTable
CREATE TABLE "strategic_decision_events" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT,
  "project_id" TEXT,
  "task_id" TEXT,
  "source" TEXT NOT NULL DEFAULT 'system',
  "event_code" TEXT NOT NULL,
  "signal" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "rationale" TEXT,
  "impact_score" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strategic_decision_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strategic_decision_events_created_at_idx" ON "strategic_decision_events"("created_at");

-- CreateIndex
CREATE INDEX "strategic_decision_events_signal_created_at_idx" ON "strategic_decision_events"("signal", "created_at");

-- CreateIndex
CREATE INDEX "strategic_decision_events_workspace_id_created_at_idx" ON "strategic_decision_events"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "strategic_decision_events_project_id_created_at_idx" ON "strategic_decision_events"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "strategic_decision_events_task_id_created_at_idx" ON "strategic_decision_events"("task_id", "created_at");

-- AddForeignKey
ALTER TABLE "strategic_decision_events"
ADD CONSTRAINT "strategic_decision_events_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_decision_events"
ADD CONSTRAINT "strategic_decision_events_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_decision_events"
ADD CONSTRAINT "strategic_decision_events_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
