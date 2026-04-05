-- CreateTable
CREATE TABLE "public"."user_phones" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_phones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_phones_phone_number_key" ON "public"."user_phones"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "user_phones_clerk_user_id_key" ON "public"."user_phones"("clerk_user_id");

-- AlterTable
ALTER TABLE "public"."whatsapp_conversation_sessions" ADD COLUMN "clerk_user_id" TEXT;
