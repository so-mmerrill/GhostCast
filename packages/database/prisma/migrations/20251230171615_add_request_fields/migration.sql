-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "clientName" VARCHAR(200),
ADD COLUMN     "executionWeeks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "preparationWeeks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "projectId" VARCHAR(100),
ADD COLUMN     "projectName" VARCHAR(200),
ADD COLUMN     "projectTypeId" TEXT,
ADD COLUMN     "reportingWeeks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requestedStartDate" TIMESTAMP(3),
ADD COLUMN     "timezone" VARCHAR(100),
ADD COLUMN     "travelRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "urlLink" VARCHAR(500);

-- CreateTable
CREATE TABLE "RequestMember" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "RequestMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestSkill" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "RequestSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestMember_memberId_idx" ON "RequestMember"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestMember_requestId_memberId_key" ON "RequestMember"("requestId", "memberId");

-- CreateIndex
CREATE INDEX "RequestSkill_skillId_idx" ON "RequestSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestSkill_requestId_skillId_key" ON "RequestSkill"("requestId", "skillId");

-- CreateIndex
CREATE INDEX "Request_projectTypeId_idx" ON "Request"("projectTypeId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_projectTypeId_fkey" FOREIGN KEY ("projectTypeId") REFERENCES "ProjectType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMember" ADD CONSTRAINT "RequestMember_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMember" ADD CONSTRAINT "RequestMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestSkill" ADD CONSTRAINT "RequestSkill_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestSkill" ADD CONSTRAINT "RequestSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
