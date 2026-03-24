import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';

// Keys that should be encrypted
const SENSITIVE_KEYS = ['apiKey', 'API_KEY', 'secret', 'password', 'token'];

@Injectable()
export class UserSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private shouldEncrypt(key: string): boolean {
    return SENSITIVE_KEYS.some((k) =>
      key.toLowerCase().includes(k.toLowerCase()),
    );
  }

  async getSetting(
    userId: string,
    integrationId: string,
    key: string,
  ): Promise<string | null> {
    const setting = await this.prisma.userIntegrationSetting.findUnique({
      where: {
        userId_integrationId_key: { userId, integrationId, key },
      },
    });

    if (!setting) return null;

    return setting.isEncrypted
      ? this.encryption.decrypt(setting.value)
      : setting.value;
  }

  async getAllSettings(
    userId: string,
    integrationId: string,
  ): Promise<Record<string, string>> {
    const settings = await this.prisma.userIntegrationSetting.findMany({
      where: { userId, integrationId },
    });

    const result: Record<string, string> = {};
    for (const setting of settings) {
      result[setting.key] = setting.isEncrypted
        ? this.encryption.decrypt(setting.value)
        : setting.value;
    }
    return result;
  }

  async setSetting(
    userId: string,
    integrationId: string,
    key: string,
    value: string,
  ): Promise<void> {
    const shouldEncrypt = this.shouldEncrypt(key);
    const storedValue = shouldEncrypt
      ? this.encryption.encrypt(value)
      : value;

    await this.prisma.userIntegrationSetting.upsert({
      where: {
        userId_integrationId_key: { userId, integrationId, key },
      },
      create: {
        userId,
        integrationId,
        key,
        value: storedValue,
        isEncrypted: shouldEncrypt,
      },
      update: {
        value: storedValue,
        isEncrypted: shouldEncrypt,
      },
    });
  }

  async setMultipleSettings(
    userId: string,
    integrationId: string,
    settings: Record<string, string>,
  ): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined && value !== '') {
        await this.setSetting(userId, integrationId, key, value);
      }
    }
  }

  async deleteSetting(
    userId: string,
    integrationId: string,
    key: string,
  ): Promise<void> {
    await this.prisma.userIntegrationSetting.deleteMany({
      where: { userId, integrationId, key },
    });
  }

  async deleteAllSettings(
    userId: string,
    integrationId: string,
  ): Promise<void> {
    await this.prisma.userIntegrationSetting.deleteMany({
      where: { userId, integrationId },
    });
  }

  async hasConfiguration(
    userId: string,
    integrationId: string,
  ): Promise<boolean> {
    const count = await this.prisma.userIntegrationSetting.count({
      where: { userId, integrationId },
    });
    return count > 0;
  }
}
