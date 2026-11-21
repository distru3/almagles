-- CreateEnum
CREATE TYPE "QuranMarkKind" AS ENUM ('tilawa', 'hifz', 'muraja', 'tadabbur', 'custom');

-- CreateTable
CREATE TABLE "QuranBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "QuranMarkKind" NOT NULL,
    "slot" TEXT NOT NULL,
    "label" TEXT,
    "sura" INTEGER NOT NULL,
    "aya" INTEGER NOT NULL,
    "page" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuranBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuranBookmark_userId_slot_key" ON "QuranBookmark"("userId", "slot");

-- AddForeignKey
ALTER TABLE "QuranBookmark" ADD CONSTRAINT "QuranBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
