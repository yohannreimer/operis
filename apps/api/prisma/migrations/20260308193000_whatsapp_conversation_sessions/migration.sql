-- CreateTable
CREATE TABLE "whatsapp_conversation_sessions" (
  "id" TEXT NOT NULL,
  "phone_number" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'idle',
  "payload" JSONB,
  "expires_at" TIMESTAMP(3),
  "last_interaction_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "whatsapp_conversation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversation_sessions_phone_number_key"
  ON "whatsapp_conversation_sessions"("phone_number");

-- CreateIndex
CREATE INDEX "whatsapp_conversation_sessions_state_expires_at_idx"
  ON "whatsapp_conversation_sessions"("state", "expires_at");
