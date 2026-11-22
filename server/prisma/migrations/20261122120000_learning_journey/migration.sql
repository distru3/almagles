-- CreateEnum
CREATE TYPE "LearningKind" AS ENUM ('reading', 'video', 'audio', 'article', 'practice');

-- CreateTable
CREATE TABLE "LearningItem" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kind" "LearningKind" NOT NULL DEFAULT 'reading',
    "title" TEXT NOT NULL,
    "source" TEXT,
    "portion" TEXT,
    "description" TEXT,
    "linkUrl" TEXT,
    "minutes" INTEGER,
    "points" INTEGER NOT NULL DEFAULT 15,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningEnrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startDay" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningCompletion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "madeUp" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningItem_date_idx" ON "LearningItem"("date");

-- CreateIndex
CREATE UNIQUE INDEX "LearningEnrollment_userId_key" ON "LearningEnrollment"("userId");

-- CreateIndex
CREATE INDEX "LearningEnrollment_active_idx" ON "LearningEnrollment"("active");

-- CreateIndex
CREATE INDEX "LearningCompletion_day_idx" ON "LearningCompletion"("day");

-- CreateIndex
CREATE INDEX "LearningCompletion_userId_day_idx" ON "LearningCompletion"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "LearningCompletion_itemId_userId_key" ON "LearningCompletion"("itemId", "userId");

-- AddForeignKey
ALTER TABLE "LearningItem" ADD CONSTRAINT "LearningItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEnrollment" ADD CONSTRAINT "LearningEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningCompletion" ADD CONSTRAINT "LearningCompletion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningCompletion" ADD CONSTRAINT "LearningCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
