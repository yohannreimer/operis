CREATE TYPE "NoteArtifactKind" AS ENUM ('diagram', 'mindmap', 'whiteboard');

ALTER TABLE "notes" ADD COLUMN "edit_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "note_artifacts" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "kind" "NoteArtifactKind" NOT NULL,
    "title" TEXT,
    "data" JSONB NOT NULL,
    "edit_version" INTEGER NOT NULL DEFAULT 1,
    "legacy_source" TEXT,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "note_artifact_revisions" (
    "id" TEXT NOT NULL,
    "note_revision_id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "kind" "NoteArtifactKind" NOT NULL,
    "title" TEXT,
    "data" JSONB NOT NULL,
    "edit_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_artifact_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "note_artifacts_legacy_source_legacy_id_key"
    ON "note_artifacts"("legacy_source", "legacy_id");
CREATE INDEX "note_artifacts_note_id_updated_at_idx"
    ON "note_artifacts"("note_id", "updated_at");
CREATE INDEX "note_artifact_revisions_note_revision_id_idx"
    ON "note_artifact_revisions"("note_revision_id");

ALTER TABLE "note_artifacts" ADD CONSTRAINT "note_artifacts_note_id_fkey"
    FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "note_artifact_revisions" ADD CONSTRAINT "note_artifact_revisions_note_revision_id_fkey"
    FOREIGN KEY ("note_revision_id") REFERENCES "note_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "note_artifacts" (
    "id",
    "note_id",
    "kind",
    "title",
    "data",
    "legacy_source",
    "legacy_id",
    "created_at",
    "updated_at"
)
SELECT
    substr(md5('diagram:' || d."id"), 1, 8) || '-' ||
    substr(md5('diagram:' || d."id"), 9, 4) || '-4' ||
    substr(md5('diagram:' || d."id"), 14, 3) || '-8' ||
    substr(md5('diagram:' || d."id"), 18, 3) || '-' ||
    substr(md5('diagram:' || d."id"), 21, 12),
    d."note_id",
    'diagram',
    d."title",
    d."data",
    'diagrams',
    d."id",
    d."created_at",
    d."updated_at"
FROM "diagrams" d
ON CONFLICT ("legacy_source", "legacy_id") DO NOTHING;

INSERT INTO "note_artifacts" (
    "id",
    "note_id",
    "kind",
    "title",
    "data",
    "legacy_source",
    "legacy_id",
    "created_at",
    "updated_at"
)
SELECT
    substr(md5('mindmap:' || m."id"), 1, 8) || '-' ||
    substr(md5('mindmap:' || m."id"), 9, 4) || '-4' ||
    substr(md5('mindmap:' || m."id"), 14, 3) || '-8' ||
    substr(md5('mindmap:' || m."id"), 18, 3) || '-' ||
    substr(md5('mindmap:' || m."id"), 21, 12),
    m."note_id",
    'mindmap',
    m."title",
    m."data",
    'mind_maps',
    m."id",
    m."created_at",
    m."updated_at"
FROM "mind_maps" m
ON CONFLICT ("legacy_source", "legacy_id") DO NOTHING;

INSERT INTO "note_artifacts" (
    "id",
    "note_id",
    "kind",
    "title",
    "data",
    "legacy_source",
    "legacy_id",
    "created_at",
    "updated_at"
)
SELECT
    substr(md5('whiteboard:' || w."id"), 1, 8) || '-' ||
    substr(md5('whiteboard:' || w."id"), 9, 4) || '-4' ||
    substr(md5('whiteboard:' || w."id"), 14, 3) || '-8' ||
    substr(md5('whiteboard:' || w."id"), 18, 3) || '-' ||
    substr(md5('whiteboard:' || w."id"), 21, 12),
    w."note_id",
    'whiteboard',
    w."title",
    w."data",
    'whiteboards',
    w."id",
    w."created_at",
    w."updated_at"
FROM "whiteboards" w
ON CONFLICT ("legacy_source", "legacy_id") DO NOTHING;
