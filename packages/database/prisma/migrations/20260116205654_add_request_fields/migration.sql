-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "format" VARCHAR(100),
ADD COLUMN     "location" VARCHAR(200),
ADD COLUMN     "requestedEndDate" TIMESTAMP(3),
ADD COLUMN     "requiredMemberCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "studentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "travelLocation" VARCHAR(200);
