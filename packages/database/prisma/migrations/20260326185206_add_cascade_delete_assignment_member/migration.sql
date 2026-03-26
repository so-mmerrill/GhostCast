-- DropForeignKey
ALTER TABLE "AssignmentMember" DROP CONSTRAINT "AssignmentMember_memberId_fkey";

-- AddForeignKey
ALTER TABLE "AssignmentMember" ADD CONSTRAINT "AssignmentMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
