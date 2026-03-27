-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProjectMethodology" ADD VALUE 'entrega';
ALTER TYPE "ProjectMethodology" ADD VALUE 'exploracao';
ALTER TYPE "ProjectMethodology" ADD VALUE 'pipeline';
ALTER TYPE "ProjectMethodology" ADD VALUE 'captacao';
ALTER TYPE "ProjectMethodology" ADD VALUE 'campanha';
ALTER TYPE "ProjectMethodology" ADD VALUE 'processo';
ALTER TYPE "ProjectMethodology" ADD VALUE 'okr';
ALTER TYPE "ProjectMethodology" ADD VALUE 'decisao';
ALTER TYPE "ProjectMethodology" ADD VALUE 'mentoria';
ALTER TYPE "ProjectMethodology" ADD VALUE 'autoridade';
ALTER TYPE "ProjectMethodology" ADD VALUE 'cenario';
ALTER TYPE "ProjectMethodology" ADD VALUE 'runway';
ALTER TYPE "ProjectMethodology" ADD VALUE 'sistema_receita';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "methodology_data" JSONB;
