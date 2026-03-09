/*
  Warnings:

  - The primary key for the `note_folders` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "note_folders" DROP CONSTRAINT "note_folders_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_folder_id_fkey";

-- AlterTable
ALTER TABLE "note_folders" DROP CONSTRAINT "note_folders_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "parent_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "note_folders_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "notes" ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "folder_id" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "project_metric_checkins" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "project_metrics" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "task_restrictions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "note_folders" ADD CONSTRAINT "note_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "note_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "note_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
