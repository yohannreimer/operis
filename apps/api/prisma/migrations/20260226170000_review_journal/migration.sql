-- CreateEnum
CREATE TYPE "ReviewPeriodType" AS ENUM ('weekly', 'monthly');

-- CreateEnum
CREATE TYPE "CommitmentLevel" AS ENUM ('baixo', 'medio', 'alto');

-- CreateTable
CREATE TABLE "strategic_reviews" (
  "id" TEXT NOT NULL,
  "period_type" "ReviewPeriodType" NOT NULL,
  "period_start" DATE NOT NULL,
  "workspace_scope" TEXT NOT NULL DEFAULT '__all__',
  "workspace_id" TEXT,
  "next_priority" TEXT,
  "strategic_decision" TEXT,
  "commitment_level" "CommitmentLevel",
  "action_items" JSONB,
  "reflection" TEXT,
  "review_snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "strategic_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strategic_reviews_period_type_period_start_workspace_scope_key"
ON "strategic_reviews"("period_type", "period_start", "workspace_scope");

-- CreateIndex
CREATE INDEX "strategic_reviews_workspace_id_idx" ON "strategic_reviews"("workspace_id");

-- CreateIndex
CREATE INDEX "strategic_reviews_period_type_period_start_idx"
ON "strategic_reviews"("period_type", "period_start");

-- AddForeignKey
ALTER TABLE "strategic_reviews"
ADD CONSTRAINT "strategic_reviews_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
