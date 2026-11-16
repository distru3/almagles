-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'adhkar_morning';
ALTER TYPE "NotificationType" ADD VALUE 'adhkar_evening';
ALTER TYPE "NotificationType" ADD VALUE 'adhkar_sleep';

-- CreateTable
CREATE TABLE "AdhkarReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "morningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "morningTime" TEXT NOT NULL DEFAULT '06:00',
    "eveningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "eveningTime" TEXT NOT NULL DEFAULT '16:30',
    "sleepEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sleepTime" TEXT NOT NULL DEFAULT '22:30',
    "lastMorningDate" TEXT,
    "lastEveningDate" TEXT,
    "lastSleepDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdhkarReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdhkarReminder_userId_key" ON "AdhkarReminder"("userId");

-- CreateIndex
CREATE INDEX "AdhkarReminder_enabled_idx" ON "AdhkarReminder"("enabled");

-- AddForeignKey
ALTER TABLE "AdhkarReminder" ADD CONSTRAINT "AdhkarReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
