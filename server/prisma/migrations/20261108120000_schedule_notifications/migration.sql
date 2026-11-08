-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'schedule_change';
ALTER TYPE "NotificationType" ADD VALUE 'schedule_reminder';

-- AlterTable
ALTER TABLE "ScheduleItem" ADD COLUMN "startTime" TEXT,
ADD COLUMN "timeZone" TEXT,
ADD COLUMN "remindAt" TIMESTAMP(3),
ADD COLUMN "remindedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "postId" DROP NOT NULL,
ADD COLUMN "scheduleItemId" TEXT,
ADD COLUMN "scheduleDates" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "ScheduleItem_remindAt_idx" ON "ScheduleItem"("remindAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
