-- CreateEnum
CREATE TYPE "TaskTime" AS ENUM ('anytime', 'range', 'qiyam');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "startDate" TEXT,
ADD COLUMN "endDate" TEXT,
ADD COLUMN "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "timeWindow" "TaskTime" NOT NULL DEFAULT 'anytime',
ADD COLUMN "startTime" TEXT,
ADD COLUMN "endTime" TEXT;

-- AlterTable: existing ticks count for their period's date, or the day they were made.
ALTER TABLE "TaskCompletion" ADD COLUMN "day" TEXT,
ADD COLUMN "points" INTEGER NOT NULL DEFAULT 10;
UPDATE "TaskCompletion" SET "day" = CASE WHEN "period" ~ '^\d{4}-\d{2}-\d{2}$' AND "period" IS NOT NULL THEN "period" ELSE to_char("createdAt", 'YYYY-MM-DD') END;
ALTER TABLE "TaskCompletion" ALTER COLUMN "day" SET NOT NULL;

-- CreateIndex
CREATE INDEX "TaskCompletion_day_idx" ON "TaskCompletion"("day");
