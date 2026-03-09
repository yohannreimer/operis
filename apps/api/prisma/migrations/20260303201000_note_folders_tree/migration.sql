-- Create table for hierarchical note folders
CREATE TABLE "note_folders" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT DEFAULT '#4f7cff',
  "parent_id" UUID,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "note_folders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "note_folders"
ADD CONSTRAINT "note_folders_parent_id_fkey"
FOREIGN KEY ("parent_id") REFERENCES "note_folders"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "note_folders_parent_id_sort_order_idx" ON "note_folders"("parent_id", "sort_order");
CREATE INDEX "note_folders_archived_at_sort_order_idx" ON "note_folders"("archived_at", "sort_order");

-- Add folder relation to notes
ALTER TABLE "notes"
ADD COLUMN "folder_id" UUID;

ALTER TABLE "notes"
ADD CONSTRAINT "notes_folder_id_fkey"
FOREIGN KEY ("folder_id") REFERENCES "note_folders"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "notes_folder_id_updated_at_idx" ON "notes"("folder_id", "updated_at");
