-- CreateTable
CREATE TABLE "AssignmentFormatter" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "formatterId" TEXT NOT NULL,

    CONSTRAINT "AssignmentFormatter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formatter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isBold" BOOLEAN NOT NULL DEFAULT false,
    "prefix" VARCHAR(50),
    "suffix" VARCHAR(50),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Formatter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentFormatter_formatterId_idx" ON "AssignmentFormatter"("formatterId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentFormatter_assignmentId_formatterId_key" ON "AssignmentFormatter"("assignmentId", "formatterId");

-- CreateIndex
CREATE UNIQUE INDEX "Formatter_name_key" ON "Formatter"("name");

-- CreateIndex
CREATE INDEX "Formatter_isActive_idx" ON "Formatter"("isActive");

-- AddForeignKey
ALTER TABLE "AssignmentFormatter" ADD CONSTRAINT "AssignmentFormatter_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentFormatter" ADD CONSTRAINT "AssignmentFormatter_formatterId_fkey" FOREIGN KEY ("formatterId") REFERENCES "Formatter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
