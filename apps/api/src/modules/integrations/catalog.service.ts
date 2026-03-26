import { Injectable } from '@nestjs/common';
import {
  CatalogItem,
  PluginType,
  PluginScope,
  IntegrationCategory,
} from '@ghostcast/shared';
import { AuditService } from '../audit/audit.service';
import { PluginRegistry } from '../../plugins/plugin.registry';

const CRUD_ACTIONS = new Set(['CREATE', 'UPDATE', 'DELETE']);

@Injectable()
export class CatalogService {
  constructor(
    private readonly auditService: AuditService,
    private readonly pluginRegistry: PluginRegistry,
  ) {}
  private readonly catalog: CatalogItem[] = [
    // ===========================================
    // Integrations (data flows INTO the app)
    // ===========================================
    {
      id: 'openai-llm',
      type: PluginType.INTEGRATION,
      scope: PluginScope.USER, // Per-user enablement with individual API keys
      name: 'openai-llm',
      displayName: 'AI Assistant',
      description:
        'AI-powered chat assistant with scheduling suggestions and natural language queries. Configure your Bedrock API key to get started.',
      icon: 'Sparkles',
      category: IntegrationCategory.AI_ML,
      author: 'GhostCast Team',
      version: '1.0.0',
      tags: ['User', 'ai', 'openai', 'gpt', 'chat', 'assistant'],
      configSchema: [
        {
          key: 'apiKey',
          type: 'password',
          label: 'Bedrock API Key',
          description: 'Your Bedrock API key (stored per-user)',
          required: true,
        },
        {
          key: 'baseUrl',
          type: 'string',
          label: 'API Base URL',
          description: 'Bedrock API endpoint (for custom endpoints)',
          default: 'https://bedrock.icp.specterops.io:7443/v1',
        },
        {
          key: 'model',
          type: 'select',
          label: 'Model',
          description: 'Which model to use',
          default: 'bedrock-claude-4-5-sonnet',
          options: [
            { label: 'Sonnet-4.5', value: 'bedrock-claude-4-5-sonnet' },
            { label: 'Haiku-3.5', value: 'bedrock-claude-3-5-haiku' },
            { label: 'Deepseek-r1', value: 'bedrock-deepseek-r1' },
            { label: 'OSS-120b', value: 'bedrock-openai-gpt-oss-120b' },
            { label: 'Coder-30b', value: 'bedrock-qwen3-coder-30b' },
            { label: 'Maverick-17b', value: 'bedrock-llama4-maverick-17b-instruct' },
          ],
        },
      ],
      uiSlots: {
        iconTray: {
          slotId: 'openai-llm-chat',
          icon: 'Sparkles',
          tooltip: 'AI Assistant',
          panelTitle: 'AI Assistant',
          priority: 10,
          windowWidth: 400,
          windowHeight: 550,
        },
      },
    },
    {
      id: 'kantata-members',
      type: PluginType.INTEGRATION,
      scope: PluginScope.SYSTEM, // System-wide data sync
      name: 'kantata-members',
      displayName: 'Kantata Sync',
      description:
        'Sync data from Kantata (formerly Mavenlink) to GhostCast. Supports scheduled and manual sync with configurable conflict handling.',
      icon: 'Users',
      category: IntegrationCategory.DATA_SYNC,
      author: 'GhostCast Team',
      version: '1.0.0',
      tags: ['Admin', 'kantata', 'mavenlink', 'members', 'sync', 'hr'],
      configSchema: [
        {
          key: 'oauthToken',
          type: 'password',
          label: 'OAuth Token',
          description: 'Kantata OAuth access token',
          required: true,
        },
        {
          key: 'apiBaseUrl',
          type: 'string',
          label: 'API Base URL',
          description: 'Kantata API base URL',
          default: 'https://api.mavenlink.com/api/v1',
        },
        {
          key: 'syncIntervalMinutes',
          type: 'number',
          label: 'Sync Interval (minutes)',
          description:
            'How often to run the sync pipeline (0 to disable)',
          default: 0,
          validation: { min: 0, max: 1440 },
          group: 'sync-schedule',
        },
        {
          key: 'syncDateFilterType',
          type: 'select',
          label: 'Date Filter Type',
          description:
            'Filter requests and assignments by created or updated date',
          default: 'created_after',
          options: [
            { label: 'Created After', value: 'created_after' },
            { label: 'Updated After', value: 'updated_after' },
          ],
          group: 'sync-schedule',
        },
        {
          key: 'syncDateFilterValue',
          type: 'string',
          label: 'Date Filter Value',
          description:
            'Auto-updated after each pipeline run. Set manually to override.',
          default: 'YYYY-MM-DD',
          group: 'sync-schedule',
        },
        {
          key: 'syncPipeline',
          type: 'syncPipeline',
          label: 'Sync Pipeline',
          description:
            'Define the ordered sequence of sync actions to execute on each scheduled run',
          default: [],
          pipelineActions: [
            { id: 'sync', label: 'Sync Members' },
            { id: 'sync-skills', label: 'Sync Skills' },
            { id: 'sync-requests', label: 'Sync Requests' },
            { id: 'sync-assignments', label: 'Sync Assignments' },
            { id: 'sync-fto', label: 'Sync FTO' },
            { id: 'sync-holidays', label: 'Sync Holidays' },
          ],
        },
        {
          key: 'conflictStrategy',
          type: 'select',
          label: 'Conflict Strategy',
          description: 'How to handle existing members during sync',
          default: 'SKIP',
          options: [
            { label: 'Skip existing members', value: 'SKIP' },
            { label: 'Update existing members', value: 'UPDATE' },
          ],
        },
        {
          key: 'deactivateMissing',
          type: 'boolean',
          label: 'Deactivate Missing Members',
          description:
            'Mark members as inactive if not found in Kantata during sync',
          default: false,
        },
      ],
      actions: [
        {
          id: 'sync',
          label: 'Sync Members',
          description: 'Manually trigger a sync of members from Kantata',
          icon: 'RefreshCw',
        },
        {
          id: 'sync-skills',
          label: 'Sync Skills',
          description: 'Manually trigger a sync of skills from Kantata',
          icon: 'Wrench',
        },
        {
          id: 'sync-requests',
          label: 'Sync Requests',
          description: 'Sync project schedules from Kantata as requests',
          icon: 'Calendar',
        },
        {
          id: 'sync-assignments',
          label: 'Sync Assignments',
          description: 'Sync project phase assignments from Kantata',
          icon: 'UserCheck',
        },
        {
          id: 'sync-fto',
          label: 'Sync FTO',
          description:
            'Sync Flexible Time Off days from Kantata and override existing assignments',
          icon: 'CalendarOff',
        },
        {
          id: 'sync-holidays',
          label: 'Sync Holidays',
          description:
            'Sync company-wide holidays from Kantata and override existing assignments',
          icon: 'CalendarDays',
        },
        {
          id: 'execute-pipeline',
          label: 'Execute Pipeline',
          description:
            'Run the configured sync pipeline steps in order',
          icon: 'Play',
        },
      ],
    },
    {
      id: 'quip-document-import',
      type: PluginType.INTEGRATION,
      scope: PluginScope.USER, // Per-user with individual access tokens
      name: 'quip-document-import',
      displayName: 'Quip Document Import',
      description:
        'Import project request details from Quip documents. Browse your Quip folders, select a document, and auto-fill the request form with extracted fields.',
      icon: 'FileText',
      category: IntegrationCategory.PRODUCTIVITY,
      author: 'GhostCast Team',
      version: '1.0.0',
      tags: ['User', 'quip', 'document', 'import', 'productivity', 'requests'],
      configSchema: [
        {
          key: 'personalAccessToken',
          type: 'password',
          label: 'Personal Access Token',
          description:
            'Your Quip personal access token. Generate one at https://quip.com/dev/token',
          required: true,
        },
      ],
    },
    {
      id: 'pdf-resume-import',
      type: PluginType.INTEGRATION,
      scope: PluginScope.SYSTEM,
      name: 'pdf-resume-import',
      displayName: 'PDF Resume Import',
      description:
        'Import PDF resumes and populate member profile fields (resume, certifications, training, education) using AI extraction. Requires AI Assistant to be enabled.',
      icon: 'FileUp',
      category: IntegrationCategory.DATA_SYNC,
      author: 'GhostCast Team',
      version: '1.0.0',
      tags: ['Manager', 'resume', 'pdf', 'import', 'ai', 'members'],
      requiredRole: 'MANAGER',
      dependencies: ['openai-llm'],
      configSchema: [],
      actions: [
        {
          id: 'import-resume',
          label: 'Import PDF Resume',
          description:
            'Upload a PDF resume and apply extracted data to a member profile',
          icon: 'Upload',
        },
      ],
    },
  ];

  /**
   * Merges static catalog entries with plugin-provided entries.
   * Plugin-provided entries (from getCatalogEntry()) take precedence over static ones by id.
   */
  private buildCatalog(): CatalogItem[] {
    const pluginEntries = this.pluginRegistry.getCatalogEntries();
    const pluginIds = new Set(pluginEntries.map((e) => e.id));

    // Static entries that aren't overridden by a plugin
    const staticOnly = this.catalog.filter((item) => !pluginIds.has(item.id));

    return [...staticOnly, ...pluginEntries];
  }

  findAll(): CatalogItem[] {
    return this.buildCatalog();
  }

  async findAllWithDynamicOptions(): Promise<CatalogItem[]> {
    const catalog = this.buildCatalog();

    // Check if any catalog items have multiselect fields with empty options
    const hasEmptyMultiselect = catalog.some((item) =>
      item.configSchema?.some(
        (field) => field.type === 'multiselect' && field.options?.length === 0,
      ),
    );

    if (!hasEmptyMultiselect) return catalog;

    const [distinctActions, distinctEntities] = await Promise.all([
      this.auditService.getDistinctActions(),
      this.auditService.getDistinctEntities(),
    ]);

    const actionOptions = [...distinctActions]
      .filter((a) => CRUD_ACTIONS.has(a))
      .sort((a, b) => a.localeCompare(b))
      .map((a) => ({ label: a.charAt(0) + a.slice(1).toLowerCase(), value: a }));

    const entityOptions = [...distinctEntities]
      .sort((a, b) => a.localeCompare(b))
      .map((e) => ({ label: e.replaceAll(/([A-Z])/g, ' $1').trim(), value: e }));

    return catalog.map((item) => {
      if (!item.configSchema?.some((f) => f.type === 'multiselect' && f.options?.length === 0)) {
        return item;
      }

      return {
        ...item,
        configSchema: item.configSchema?.map((field) => {
          if (field.type !== 'multiselect' || (field.options?.length ?? 0) > 0) return field;
          if (field.key === 'notifyActions') return { ...field, options: actionOptions };
          if (field.key === 'notifyEntities') return { ...field, options: entityOptions };
          return field;
        }),
      };
    });
  }

  findById(id: string): CatalogItem | undefined {
    return this.buildCatalog().find((item) => item.id === id);
  }

  findByType(type: PluginType): CatalogItem[] {
    return this.buildCatalog().filter((item) => item.type === type);
  }

  findByCategory(category: IntegrationCategory): CatalogItem[] {
    return this.buildCatalog().filter((item) => item.category === category);
  }

  findByScope(scope: PluginScope): CatalogItem[] {
    return this.buildCatalog().filter((item) => item.scope === scope);
  }

  search(query: string): CatalogItem[] {
    const lowerQuery = query.toLowerCase();
    return this.buildCatalog().filter(
      (item) =>
        item.displayName.toLowerCase().includes(lowerQuery) ||
        item.description.toLowerCase().includes(lowerQuery) ||
        item.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }
}
