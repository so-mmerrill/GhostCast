-- CreateTable
CREATE TABLE "AssignmentProjectRole" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "projectRoleId" TEXT NOT NULL,

    CONSTRAINT "AssignmentProjectRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRoleFormatter" (
    "id" TEXT NOT NULL,
    "projectRoleId" TEXT NOT NULL,
    "formatterId" TEXT NOT NULL,

    CONSTRAINT "ProjectRoleFormatter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentProjectRole_projectRoleId_idx" ON "AssignmentProjectRole"("projectRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentProjectRole_assignmentId_projectRoleId_key" ON "AssignmentProjectRole"("assignmentId", "projectRoleId");

-- CreateIndex
CREATE INDEX "ProjectRoleFormatter_formatterId_idx" ON "ProjectRoleFormatter"("formatterId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRoleFormatter_projectRoleId_formatterId_key" ON "ProjectRoleFormatter"("projectRoleId", "formatterId");

-- AddForeignKey
ALTER TABLE "AssignmentProjectRole" ADD CONSTRAINT "AssignmentProjectRole_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentProjectRole" ADD CONSTRAINT "AssignmentProjectRole_projectRoleId_fkey" FOREIGN KEY ("projectRoleId") REFERENCES "ProjectRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRoleFormatter" ADD CONSTRAINT "ProjectRoleFormatter_projectRoleId_fkey" FOREIGN KEY ("projectRoleId") REFERENCES "ProjectRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRoleFormatter" ADD CONSTRAINT "ProjectRoleFormatter_formatterId_fkey" FOREIGN KEY ("formatterId") REFERENCES "Formatter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
