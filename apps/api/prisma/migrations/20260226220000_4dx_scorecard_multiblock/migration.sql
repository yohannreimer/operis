DO $$
BEGIN
  CREATE TYPE "ProjectMetricKind" AS ENUM ('lead', 'lag');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "action_statement" TEXT,
  ADD COLUMN IF NOT EXISTS "time_horizon_end" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "result_start_value" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "result_current_value" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "result_target_value" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "scorecard_cadence_days" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS "last_scorecard_checkin_at" TIMESTAMP(3);

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "is_multi_block" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "multi_block_goal_minutes" INTEGER;

CREATE TABLE IF NOT EXISTS "project_metrics" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "kind" "ProjectMetricKind" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "target_value" DOUBLE PRECISION,
  "baseline_value" DOUBLE PRECISION,
  "current_value" DOUBLE PRECISION,
  "unit" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "project_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "project_metric_checkins" (
  "id" TEXT NOT NULL,
  "project_metric_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "week_start" DATE NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_metric_checkins_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "project_metrics"
    ADD CONSTRAINT "project_metrics_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "project_metric_checkins"
    ADD CONSTRAINT "project_metric_checkins_project_metric_id_fkey"
    FOREIGN KEY ("project_metric_id") REFERENCES "project_metrics"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "project_metric_checkins"
    ADD CONSTRAINT "project_metric_checkins_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "project_metric_checkins_project_metric_id_week_start_key"
  ON "project_metric_checkins"("project_metric_id", "week_start");

CREATE INDEX IF NOT EXISTS "project_metrics_project_id_kind_idx"
  ON "project_metrics"("project_id", "kind");

CREATE INDEX IF NOT EXISTS "project_metrics_project_id_archived_at_idx"
  ON "project_metrics"("project_id", "archived_at");

CREATE INDEX IF NOT EXISTS "project_metric_checkins_project_id_week_start_idx"
  ON "project_metric_checkins"("project_id", "week_start");

CREATE INDEX IF NOT EXISTS "tasks_is_multi_block_idx" ON "tasks"("is_multi_block");
