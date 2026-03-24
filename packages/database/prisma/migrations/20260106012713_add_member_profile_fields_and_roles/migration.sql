-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "certification" TEXT,
ADD COLUMN     "education" TEXT,
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "resume" TEXT,
ADD COLUMN     "training" TEXT;

-- CreateTable
CREATE TABLE "MemberProjectRole" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "projectRoleId" TEXT NOT NULL,
    "dateAwarded" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberProjectRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberProjectRole_projectRoleId_idx" ON "MemberProjectRole"("projectRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProjectRole_memberId_projectRoleId_key" ON "MemberProjectRole"("memberId", "projectRoleId");

-- CreateIndex
CREATE INDEX "Member_managerId_idx" ON "Member"("managerId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberProjectRole" ADD CONSTRAINT "MemberProjectRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberProjectRole" ADD CONSTRAINT "MemberProjectRole_projectRoleId_fkey" FOREIGN KEY ("projectRoleId") REFERENCES "ProjectRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
