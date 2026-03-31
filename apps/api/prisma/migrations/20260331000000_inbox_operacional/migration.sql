-- CreateEnum
CREATE TYPE "InboxItemStatus" AS ENUM ('pendente', 'feito', 'convertido', 'agenda', 'aguardando');

-- CreateTable inbox_contexts
CREATE TABLE "inbox_contexts" (
    "id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_contexts_clerk_user_id_idx" ON "inbox_contexts"("clerk_user_id");

-- Migrate InboxItem: add new columns, drop old ones
ALTER TABLE "inbox_items"
    ADD COLUMN "status"           "InboxItemStatus" NOT NULL DEFAULT 'pendente',
    ADD COLUMN "workspace_id"     TEXT,
    ADD COLUMN "inbox_context_id" TEXT,
    ADD COLUMN "position"         INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "waiting_date"     TIMESTAMP(3),
    ADD COLUMN "waiting_person"   TEXT,
    ADD COLUMN "waiting_note"     TEXT,
    ADD COLUMN "scheduled_at"     TIMESTAMP(3),
    ADD COLUMN "converted_task_id" TEXT,
    ADD COLUMN "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Migrate existing processed items to status 'feito'
UPDATE "inbox_items" SET "status" = 'feito' WHERE "processed" = true;

-- Drop old column
ALTER TABLE "inbox_items" DROP COLUMN "processed";

-- Update source column: set default
ALTER TABLE "inbox_items" ALTER COLUMN "source" SET DEFAULT 'app';

-- Recreate index
DROP INDEX IF EXISTS "inbox_items_clerk_user_id_processed_idx";
CREATE INDEX "inbox_items_clerk_user_id_status_idx" ON "inbox_items"("clerk_user_id", "status");

-- AddForeignKey inbox_items -> workspaces
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey inbox_items -> inbox_contexts
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_inbox_context_id_fkey"
    FOREIGN KEY ("inbox_context_id") REFERENCES "inbox_contexts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
