-- AlterTable
ALTER TABLE "LearningItem" ADD COLUMN     "fileBytes" INTEGER,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "filePages" INTEGER,
ADD COLUMN     "filePublicId" TEXT,
ADD COLUMN     "fileUrl" TEXT,
ADD COLUMN     "startPage" INTEGER;

-- CreateIndex
CREATE INDEX "LearningItem_filePublicId_idx" ON "LearningItem"("filePublicId");
