-- CreateEnum
CREATE TYPE "CommitmentType" AS ENUM ('fixo', 'variavel');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('ativo', 'pausado', 'encerrado');

-- CreateEnum
CREATE TYPE "RecurrenceDay" AS ENUM ('seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom');

-- CreateTable: commitments
CREATE TABLE "commitments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "project_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "CommitmentType" NOT NULL DEFAULT 'variavel',
    "status" "CommitmentStatus" NOT NULL DEFAULT 'ativo',
    "start_time" TEXT,
    "duration_min" INTEGER,
    "recurrence_days" "RecurrenceDay"[] DEFAULT ARRAY[]::"RecurrenceDay"[],
    "date" DATE,
    "recurrence_end" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: commitment_exceptions
CREATE TABLE "commitment_exceptions" (
    "id" TEXT NOT NULL,
    "commitment_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "action" TEXT NOT NULL,
    "new_date" DATE,
    "new_time" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commitment_exceptions_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "commitments_workspace_id_idx" ON "commitments"("workspace_id");
CREATE INDEX "commitments_project_id_idx" ON "commitments"("project_id");
CREATE INDEX "commitments_type_status_idx" ON "commitments"("type", "status");
CREATE INDEX "commitments_date_idx" ON "commitments"("date");
CREATE UNIQUE INDEX "commitment_exceptions_commitment_id_date_key" ON "commitment_exceptions"("commitment_id", "date");
CREATE INDEX "commitment_exceptions_commitment_id_idx" ON "commitment_exceptions"("commitment_id");

-- ForeignKey
ALTER TABLE "commitment_exceptions" ADD CONSTRAINT "commitment_exceptions_commitment_id_fkey"
    FOREIGN KEY ("commitment_id") REFERENCES "commitments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
