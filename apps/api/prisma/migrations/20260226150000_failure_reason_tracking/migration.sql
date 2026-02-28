-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM (
  'energia',
  'medo',
  'distracao',
  'dependencia',
  'falta_clareza',
  'falta_habilidade'
);

-- AlterTable
ALTER TABLE "execution_events"
ADD COLUMN "failure_reason" "FailureReason";
