import { Injectable, Logger } from '@nestjs/common';
import { QuipUser, QuipFolder, QuipThread } from './types';

const QUIP_BASE_URL = 'https://platform.quip.com/1';

@Injectable()
export class QuipApiClient {
  private readonly logger = new Logger(QuipApiClient.name);

  private async request<T>(token: string, endpoint: string): Promise<T> {
    const url = `${QUIP_BASE_URL}${endpoint}`;
    this.logger.debug(`QUIP API: GET ${endpoint}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `QUIP API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
      throw new Error(
        `Quip API error: ${response.status} ${response.statusText}`,
      );
    }

    return response.json() as Promise<T>;
  }

  async getCurrentUser(token: string): Promise<QuipUser> {
    return this.request<QuipUser>(token, '/users/current');
  }

  async getFolder(token: string, folderId: string): Promise<QuipFolder> {
    return this.request<QuipFolder>(token, `/folders/${folderId}`);
  }

  async getFolders(
    token: string,
    folderIds: string[],
  ): Promise<Record<string, QuipFolder>> {
    if (folderIds.length === 0) return {};
    return this.request<Record<string, QuipFolder>>(
      token,
      `/folders/?ids=${folderIds.join(',')}`,
    );
  }

  async getThread(token: string, threadId: string): Promise<QuipThread> {
    return this.request<QuipThread>(token, `/threads/${threadId}`);
  }

  async getThreads(
    token: string,
    threadIds: string[],
  ): Promise<Record<string, QuipThread>> {
    if (threadIds.length === 0) return {};
    return this.request<Record<string, QuipThread>>(
      token,
      `/threads/?ids=${threadIds.join(',')}`,
    );
  }

  async testConnection(
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.getCurrentUser(token);
      return { success: true, message: 'Connected to Quip API' };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
