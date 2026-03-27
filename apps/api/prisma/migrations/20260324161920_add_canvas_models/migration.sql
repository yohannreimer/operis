-- CreateTable
CREATE TABLE "diagrams" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "title" TEXT,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagrams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mind_maps" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "title" TEXT,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mind_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "diagrams_note_id_key" ON "diagrams"("note_id");

-- CreateIndex
CREATE UNIQUE INDEX "mind_maps_note_id_key" ON "mind_maps"("note_id");

-- AddForeignKey
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mind_maps" ADD CONSTRAINT "mind_maps_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
