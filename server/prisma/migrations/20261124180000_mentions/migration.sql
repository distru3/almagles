-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'mention';

-- «@الاسم»: who a comment or a reply on a فائدة tags
ALTER TABLE "Comment" ADD COLUMN     "mentionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "LearningNoteReply" ADD COLUMN     "mentionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
