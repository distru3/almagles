-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'learning_reminder';
ALTER TYPE "NotificationType" ADD VALUE 'learning_note_reply';

-- «شاركها مع إخوانك»: every note written so far stays private
ALTER TABLE "LearningNote" ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "learningNoteId" TEXT,
ADD COLUMN     "message" TEXT;

-- CreateTable
CREATE TABLE "LearningNoteReply" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningNoteReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningNote_shared_createdAt_idx" ON "LearningNote"("shared", "createdAt");

-- CreateIndex
CREATE INDEX "LearningNoteReply_noteId_createdAt_idx" ON "LearningNoteReply"("noteId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_learningNoteId_fkey" FOREIGN KEY ("learningNoteId") REFERENCES "LearningNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningNoteReply" ADD CONSTRAINT "LearningNoteReply_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "LearningNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningNoteReply" ADD CONSTRAINT "LearningNoteReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
