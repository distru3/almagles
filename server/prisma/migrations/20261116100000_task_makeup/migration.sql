-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'task_nudge';

-- CreateEnum
CREATE TYPE "TaskExcuseReason" AS ENUM ('sick', 'travel', 'other');

-- AlterTable
ALTER TABLE "TaskCompletion" ADD COLUMN "madeUp" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TaskExcuse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "reason" "TaskExcuseReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskExcuse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskExcuse_userId_day_key" ON "TaskExcuse"("userId", "day");

-- AddForeignKey
ALTER TABLE "TaskExcuse" ADD CONSTRAINT "TaskExcuse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
