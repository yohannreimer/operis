DO $$
BEGIN
  CREATE TYPE "ProjectMethodology" AS ENUM ('fourdx', 'delivery', 'launch', 'discovery', 'growth');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "methodology" "ProjectMethodology" NOT NULL DEFAULT 'fourdx';

CREATE INDEX IF NOT EXISTS "projects_methodology_idx"
  ON "projects"("methodology");
