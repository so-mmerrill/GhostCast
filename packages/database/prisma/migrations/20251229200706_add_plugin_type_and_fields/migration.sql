-- CreateEnum
CREATE TYPE "PluginType" AS ENUM ('INTEGRATION', 'EXTENSION');

-- AlterTable
ALTER TABLE "Plugin" ADD COLUMN     "catalogId" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "type" "PluginType" NOT NULL DEFAULT 'INTEGRATION';

-- CreateIndex
CREATE INDEX "Plugin_type_idx" ON "Plugin"("type");

-- CreateIndex
CREATE INDEX "Plugin_catalogId_idx" ON "Plugin"("catalogId");
