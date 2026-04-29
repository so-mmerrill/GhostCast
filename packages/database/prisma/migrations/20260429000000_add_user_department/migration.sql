-- AlterTable
ALTER TABLE "User" ADD COLUMN "department" TEXT;

-- CreateIndex
CREATE INDEX "User_department_idx" ON "User"("department");
