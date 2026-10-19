-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "linkPreviews" JSONB,
ADD COLUMN     "videoDuration" DOUBLE PRECISION,
ADD COLUMN     "videoHeight" INTEGER,
ADD COLUMN     "videoPosterUrl" TEXT,
ADD COLUMN     "videoPublicId" TEXT,
ADD COLUMN     "videoUrl" TEXT,
ADD COLUMN     "videoWidth" INTEGER;
