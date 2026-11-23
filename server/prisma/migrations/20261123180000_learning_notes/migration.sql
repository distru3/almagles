-- «فوائدي»: a lesson can hold several notes, not one
CREATE TABLE "LearningNote" (
    "id" TEXT NOT NULL,
    "completionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningNote_completionId_createdAt_idx" ON "LearningNote"("completionId", "createdAt");

-- AddForeignKey
ALTER TABLE "LearningNote" ADD CONSTRAINT "LearningNote_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "LearningCompletion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every «فائدتي» written so far becomes the lesson's first note. The old column is left as it was.
INSERT INTO "LearningNote" ("id", "completionId", "text", "createdAt", "updatedAt")
SELECT 'note_' || "id", "id", "note", "updatedAt", "updatedAt"
FROM "LearningCompletion"
WHERE "note" IS NOT NULL AND btrim("note") <> '';
