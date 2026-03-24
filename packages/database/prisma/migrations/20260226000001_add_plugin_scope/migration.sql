-- CreateEnum
CREATE TYPE "PluginScope" AS ENUM ('SYSTEM', 'USER');

-- AlterTable
ALTER TABLE "Plugin" ADD COLUMN "scope" "PluginScope" NOT NULL DEFAULT 'SYSTEM';

-- CreateIndex
CREATE INDEX "Plugin_scope_idx" ON "Plugin"("scope");
