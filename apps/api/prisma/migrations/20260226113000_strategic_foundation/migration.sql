-- CreateEnum
CREATE TYPE "WorkspaceMode" AS ENUM ('expansao', 'manutencao', 'standby');

-- AlterEnum
ALTER TYPE "WorkspaceType" ADD VALUE IF NOT EXISTS 'vida';
ALTER TYPE "WorkspaceType" ADD VALUE IF NOT EXISTS 'autoridade';
ALTER TYPE "WorkspaceType" ADD VALUE IF NOT EXISTS 'outro';

-- AlterEnum
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'latente';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'encerrado';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'fantasma';

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('construcao', 'operacao', 'crescimento');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('a', 'b', 'c');

-- CreateEnum
CREATE TYPE "TaskEnergy" AS ENUM ('alta', 'media', 'baixa');

-- CreateEnum
CREATE TYPE "TaskExecutionKind" AS ENUM ('construcao', 'operacao');

-- CreateEnum
CREATE TYPE "WaitingType" AS ENUM ('resposta', 'entrega');

-- AlterTable
ALTER TABLE "workspaces"
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Empresa',
ADD COLUMN "mode" "WorkspaceMode" NOT NULL DEFAULT 'manutencao',
ADD COLUMN "color" TEXT NOT NULL DEFAULT '#2563EB',
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "projects"
ADD COLUMN "type" "ProjectType" NOT NULL DEFAULT 'operacao',
ADD COLUMN "objective" TEXT,
ADD COLUMN "primary_metric" TEXT,
ADD COLUMN "last_strategic_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "tasks"
ADD COLUMN "definition_of_done" TEXT,
ADD COLUMN "task_type" "TaskType" NOT NULL DEFAULT 'b',
ADD COLUMN "energy_level" "TaskEnergy" NOT NULL DEFAULT 'media',
ADD COLUMN "execution_kind" "TaskExecutionKind" NOT NULL DEFAULT 'operacao',
ADD COLUMN "waiting_type" "WaitingType",
ADD COLUMN "waiting_due_date" TIMESTAMP(3),
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "tasks_task_type_idx" ON "tasks"("task_type");

-- CreateIndex
CREATE INDEX "tasks_execution_kind_idx" ON "tasks"("execution_kind");

-- CreateIndex
CREATE INDEX "tasks_waiting_due_date_idx" ON "tasks"("waiting_due_date");
