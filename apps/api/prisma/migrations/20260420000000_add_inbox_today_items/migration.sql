-- CreateTable
CREATE TABLE "inbox_today_items" (
    "id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "inbox_item_id" TEXT NOT NULL,
    "today_date" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_today_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbox_today_items_clerk_user_id_inbox_item_id_today_date_key" ON "inbox_today_items"("clerk_user_id", "inbox_item_id", "today_date");

-- CreateIndex
CREATE INDEX "inbox_today_items_clerk_user_id_today_date_idx" ON "inbox_today_items"("clerk_user_id", "today_date");

-- AddForeignKey
ALTER TABLE "inbox_today_items" ADD CONSTRAINT "inbox_today_items_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "inbox_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
