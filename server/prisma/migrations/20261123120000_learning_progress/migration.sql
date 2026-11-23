-- «طلب العلم» tasks ticked by «رحلة العلم»
ALTER TABLE "Task" ADD COLUMN     "fromLearning" BOOLEAN NOT NULL DEFAULT false;

-- The last page of a lesson in its PDF
ALTER TABLE "LearningItem" ADD COLUMN     "endPage" INTEGER;

-- Part of a lesson: how much (100 = finished), where the member stopped, and when it was finished
ALTER TABLE "LearningCompletion" ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "page" INTEGER,
ADD COLUMN     "doneAt" TIMESTAMP(3);

-- Every lesson ticked before this was finished when it was ticked.
UPDATE "LearningCompletion" SET "doneAt" = "createdAt";
