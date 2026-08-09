-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canManageSchedule" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "_CategoryAdmins" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CategoryAdmins_AB_unique" ON "_CategoryAdmins"("A", "B");

-- CreateIndex
CREATE INDEX "_CategoryAdmins_B_index" ON "_CategoryAdmins"("B");

-- AddForeignKey
ALTER TABLE "_CategoryAdmins" ADD CONSTRAINT "_CategoryAdmins_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryAdmins" ADD CONSTRAINT "_CategoryAdmins_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
