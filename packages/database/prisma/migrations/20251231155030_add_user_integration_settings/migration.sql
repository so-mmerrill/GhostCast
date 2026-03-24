-- CreateTable
CREATE TABLE "UserIntegrationSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIntegrationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserIntegrationSetting_userId_idx" ON "UserIntegrationSetting"("userId");

-- CreateIndex
CREATE INDEX "UserIntegrationSetting_integrationId_idx" ON "UserIntegrationSetting"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIntegrationSetting_userId_integrationId_key_key" ON "UserIntegrationSetting"("userId", "integrationId", "key");

-- AddForeignKey
ALTER TABLE "UserIntegrationSetting" ADD CONSTRAINT "UserIntegrationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
