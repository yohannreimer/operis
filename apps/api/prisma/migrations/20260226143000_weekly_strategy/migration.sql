-- CreateTable
CREATE TABLE "weekly_energy_plans" (
  "id" TEXT NOT NULL,
  "week_start" DATE NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "planned_percent" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_energy_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_energy_plans_week_start_workspace_id_key"
ON "weekly_energy_plans"("week_start", "workspace_id");

-- CreateIndex
CREATE INDEX "weekly_energy_plans_workspace_id_idx" ON "weekly_energy_plans"("workspace_id");

-- AddForeignKey
ALTER TABLE "weekly_energy_plans"
ADD CONSTRAINT "weekly_energy_plans_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
