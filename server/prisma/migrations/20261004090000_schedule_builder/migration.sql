-- Schedule builder merged from almagles-schedule: link labels, custom columns,
-- per-day ordering, and source ids for the re-runnable Firebase import. Additive only.
-- AlterTable
ALTER TABLE "ScheduleItem" ADD COLUMN     "customValues" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "linkLabel" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceId" TEXT;

-- CreateTable
CREATE TABLE "ScheduleColumn" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleColumn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleColumn_sourceId_key" ON "ScheduleColumn"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleItem_sourceId_key" ON "ScheduleItem"("sourceId");

