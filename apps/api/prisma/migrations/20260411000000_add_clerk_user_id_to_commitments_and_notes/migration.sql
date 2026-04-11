-- Add clerk_user_id to commitments and notes tables
-- Existing rows get 'legacy' placeholder so NOT NULL constraint is satisfied

-- commitments
ALTER TABLE "commitments" ADD COLUMN IF NOT EXISTS "clerk_user_id" TEXT NOT NULL DEFAULT 'legacy';

-- notes
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "clerk_user_id" TEXT NOT NULL DEFAULT 'legacy';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "commitments_clerk_user_id_idx" ON "commitments"("clerk_user_id");
CREATE INDEX IF NOT EXISTS "notes_clerk_user_id_updated_at_idx" ON "notes"("clerk_user_id", "updated_at");
