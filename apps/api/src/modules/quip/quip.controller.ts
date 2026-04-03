import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QuipApiClient } from './quip-api.client';
import { QuipParserService } from './quip-parser.service';
import { UserSettingsService } from '../user-settings/user-settings.service';
import { LlmChatService } from '../llm-chat/llm-chat.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@ghostcast/database';
import {
  QuipBrowseResponse,
  QuipBrowserItem,
  QuipParsedRequestFields,
  QuipConfigStatus,
} from '@ghostcast/shared';

const QUIP_CATALOG_ID = 'quip-document-import';

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('quip')
export class QuipController {
  constructor(
    private readonly quipClient: QuipApiClient,
    private readonly parserService: QuipParserService,
    private readonly userSettingsService: UserSettingsService,
    private readonly llmChatService: LlmChatService,
  ) {}

  /**
   * Check if the current user has QUIP configured.
   */
  @Get('status')
  async getStatus(@CurrentUser() user: User): Promise<QuipConfigStatus> {
    const token = await this.userSettingsService.getSetting(user.id, QUIP_CATALOG_ID, 'personalAccessToken');
    const hasToken = !!token;

    // Check if AI parsing is available (user has configured openai-llm)
    const aiApiKey = await this.userSettingsService.getSetting(user.id, 'openai-llm', 'apiKey');
    const aiEnabled = !!aiApiKey;

    return {
      configured: hasToken,
      integrationInstalled: true, // If the endpoint is available, the plugin is installed
      integrationEnabled: hasToken,
      aiEnabled,
    };
  }

  /**
   * Browse QUIP folders. If no folderId is provided, returns the user's root folders.
   */
  @Get('browse')
  async browse(
    @CurrentUser() user: User,
    @Query('folderId') folderId?: string,
  ): Promise<QuipBrowseResponse> {
    const token = await this.getUserToken(user.id);

    if (!folderId) {
      return this.buildRootFolderResponse(token);
    }

    return this.buildFolderResponse(token, folderId);
  }

  /**
   * Build response for root-level folders
   */
  private async buildRootFolderResponse(token: string): Promise<QuipBrowseResponse> {
    const quipUser = await this.quipClient.getCurrentUser(token);

    const rootFolders = [
      { id: quipUser.private_folder_id, title: 'Private' },
      { id: quipUser.starred_folder_id, title: 'Starred' },
      { id: quipUser.desktop_folder_id, title: 'Desktop' },
    ];

    const items: QuipBrowserItem[] = rootFolders
      .filter(rf => rf.id)
      .map(rf => ({ id: rf.id, title: rf.title, type: 'folder' as const }));

    return {
      folderId: 'root',
      folderTitle: 'Quip',
      items,
      breadcrumbs: [],
    };
  }

  /**
   * Build response for a specific folder
   */
  private async buildFolderResponse(token: string, folderId: string): Promise<QuipBrowseResponse> {
    const folder = await this.quipClient.getFolder(token, folderId);
    const children = folder.children || [];

    const { folderIds, threadIds } = this.collectChildIds(children);
    const [subFolders, threads] = await this.fetchChildMetadata(token, folderIds, threadIds);
    const items = this.buildItemsFromChildren(children, subFolders, threads);

    return {
      folderId,
      folderTitle: folder.folder.title,
      items,
      breadcrumbs: [{ id: folderId, title: folder.folder.title }],
    };
  }

  /**
   * Collect folder and thread IDs from children
   */
  private collectChildIds(children: Array<{ folder_id?: string; thread_id?: string }>): {
    folderIds: string[];
    threadIds: string[];
  } {
    const folderIds: string[] = [];
    const threadIds: string[] = [];

    for (const child of children) {
      if (child.folder_id) folderIds.push(child.folder_id);
      else if (child.thread_id) threadIds.push(child.thread_id);
    }

    return { folderIds, threadIds };
  }

  /**
   * Batch-fetch folder and thread metadata
   */
  private async fetchChildMetadata(
    token: string,
    folderIds: string[],
    threadIds: string[],
  ): Promise<[Record<string, { folder: { title: string } }>, Record<string, { thread: { title: string; updated_usec: number } }>]> {
    return Promise.all([
      folderIds.length > 0
        ? this.quipClient.getFolders(token, folderIds)
        : Promise.resolve({} as Record<string, never>),
      threadIds.length > 0
        ? this.quipClient.getThreads(token, threadIds)
        : Promise.resolve({} as Record<string, never>),
    ]);
  }

  /**
   * Build items list from children in original order
   */
  private buildItemsFromChildren(
    children: Array<{ folder_id?: string; thread_id?: string }>,
    subFolders: Record<string, { folder: { title: string } }>,
    threads: Record<string, { thread: { title: string; updated_usec: number } }>,
  ): QuipBrowserItem[] {
    const items: QuipBrowserItem[] = [];

    for (const child of children) {
      const item = this.buildItemFromChild(child, subFolders, threads);
      if (item) items.push(item);
    }

    return items;
  }

  /**
   * Build a single item from a child entry
   */
  private buildItemFromChild(
    child: { folder_id?: string; thread_id?: string },
    subFolders: Record<string, { folder: { title: string } }>,
    threads: Record<string, { thread: { title: string; updated_usec: number } }>,
  ): QuipBrowserItem | null {
    if (child.folder_id) {
      const sf = subFolders[child.folder_id];
      if (sf) {
        return { id: child.folder_id, title: sf.folder.title, type: 'folder' };
      }
    } else if (child.thread_id) {
      const t = threads[child.thread_id];
      if (t) {
        return {
          id: child.thread_id,
          title: t.thread.title,
          type: 'document',
          updatedAt: new Date(t.thread.updated_usec / 1000).toISOString(),
        };
      }
    }
    return null;
  }

  /**
   * Parse a QUIP document and return extracted request fields.
   */
  @Get('parse/:threadId')
  async parseDocument(
    @CurrentUser() user: User,
    @Param('threadId') threadId: string,
  ): Promise<QuipParsedRequestFields> {
    const token = await this.getUserToken(user.id);
    const thread = await this.quipClient.getThread(token, threadId);
    const parsed = await this.parserService.parse(
      thread.html,
      thread.thread.title,
    );

    // Use document title as project name fallback
    if (!parsed.projectName && !parsed.title) {
      parsed.projectName = thread.thread.title;
    }

    // Use the Quip document link as the URL
    if (!parsed.urlLink) {
      parsed.urlLink = thread.thread.link;
    }

    return parsed;
  }

  /**
   * Parse a QUIP document using the AI assistant and return extracted request fields.
   */
  @Get('ai-parse/:threadId')
  async aiParseDocument(
    @CurrentUser() user: User,
    @Param('threadId') threadId: string,
  ): Promise<QuipParsedRequestFields> {
    const token = await this.getUserToken(user.id);
    const thread = await this.quipClient.getThread(token, threadId);
    const plainText = this.parserService.htmlToText(thread.html);
    const parsed = await this.llmChatService.parseQuipDocument(
      user.id,
      plainText,
    );

    // Set project name to client name if not already set
    if (!parsed.projectName && parsed.clientName) {
      parsed.projectName = parsed.clientName;
    } else if (!parsed.projectName && !parsed.title) {
      parsed.projectName = thread.thread.title;
    }

    // Use the Quip document link as the URL
    if (!parsed.urlLink) {
      parsed.urlLink = thread.thread.link;
    }

    // Include raw HTML for preview
    parsed.rawHtml = thread.html;

    return parsed;
  }

  private async getUserToken(userId: string): Promise<string> {
    const token = await this.userSettingsService.getSetting(userId, QUIP_CATALOG_ID, 'personalAccessToken');

    if (!token) {
      throw new BadRequestException(
        'Quip is not configured. Please add your personal access token in Integration Settings.',
      );
    }

    return token;
  }
}
