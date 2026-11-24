-- «فوائدي» stand by themselves: each note knows its writer and its lesson,
-- so unticking a lesson (which deletes its LearningCompletion) keeps them.
ALTER TABLE "LearningNote" ADD COLUMN     "userId" TEXT,
ADD COLUMN     "itemId" TEXT,
ADD COLUMN     "lessonTitle" TEXT,
ADD COLUMN     "lessonPortion" TEXT,
ADD COLUMN     "lessonKind" "LearningKind" NOT NULL DEFAULT 'reading',
ADD COLUMN     "lessonDate" TEXT;

-- Backfill every note from the record it hung on and that record's lesson.
UPDATE "LearningNote" AS n
SET "userId" = c."userId",
    "itemId" = c."itemId",
    "lessonTitle" = i."title",
    "lessonPortion" = i."portion",
    "lessonKind" = i."kind",
    "lessonDate" = i."date"
FROM "LearningCompletion" AS c
JOIN "LearningItem" AS i ON i."id" = c."itemId"
WHERE c."id" = n."completionId";

ALTER TABLE "LearningNote" ALTER COLUMN "userId" SET NOT NULL,
ALTER COLUMN "lessonTitle" SET NOT NULL,
ALTER COLUMN "lessonDate" SET NOT NULL,
ALTER COLUMN "completionId" DROP NOT NULL;

-- The old link no longer takes the note with it.
ALTER TABLE "LearningNote" DROP CONSTRAINT "LearningNote_completionId_fkey";
ALTER TABLE "LearningNote" ADD CONSTRAINT "LearningNote_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "LearningCompletion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningNote" ADD CONSTRAINT "LearningNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningNote" ADD CONSTRAINT "LearningNote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "LearningNote_userId_createdAt_idx" ON "LearningNote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningNote_itemId_idx" ON "LearningNote"("itemId");

-- «أعجبني» on a shared فائدة
CREATE TABLE "LearningNoteLike" (
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningNoteLike_pkey" PRIMARY KEY ("noteId","userId")
);

-- CreateIndex
CREATE INDEX "LearningNoteLike_userId_idx" ON "LearningNoteLike"("userId");

-- AddForeignKey
ALTER TABLE "LearningNoteLike" ADD CONSTRAINT "LearningNoteLike_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "LearningNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningNoteLike" ADD CONSTRAINT "LearningNoteLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
