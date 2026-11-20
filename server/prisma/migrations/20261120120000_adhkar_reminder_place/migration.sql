-- CreateEnum
CREATE TYPE "AdhkarTiming" AS ENUM ('prayer', 'fixed');

-- AlterTable: existing reminders move to prayer-based timing; until the member's
-- browser sends their place, the worker keeps using their fixed times.
ALTER TABLE "AdhkarReminder" ADD COLUMN     "morningMode" "AdhkarTiming" NOT NULL DEFAULT 'prayer',
ADD COLUMN     "morningOffset" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "eveningMode" "AdhkarTiming" NOT NULL DEFAULT 'prayer',
ADD COLUMN     "eveningOffset" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "placeLabel" TEXT;
