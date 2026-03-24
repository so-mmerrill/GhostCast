import type { Role } from '@ghostcast/shared';

/**
 * Route definition for plugin-registered API routes
 */
export interface RouteDefinition {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Route path (will be prefixed with /api/plugins/{pluginName}) */
  path: string;
  /** Route handler */
  handler: (req: unknown, res: unknown) => Promise<unknown>;
  /** Required roles for access */
  roles?: Role[];
  /** Route description for API docs */
  description?: string;
  /** Whether route is public (no auth required) */
  public?: boolean;
}

/**
 * WebSocket event handler
 */
export interface WebSocketHandler {
  /** Event name to listen for */
  event: string;
  /** Handler function */
  handler: (socket: unknown, data: unknown) => Promise<void>;
  /** Required roles for access */
  roles?: Role[];
}

/**
 * Scheduled job definition
 */
export interface ScheduledJob {
  /** Unique job name */
  name: string;
  /** Cron expression */
  cron: string;
  /** Job handler */
  handler: () => Promise<void>;
  /** Job description */
  description?: string;
  /** Whether job is enabled by default */
  enabled?: boolean;
  /** Timezone for cron expression */
  timezone?: string;
}

/**
 * Notification channel for sending notifications
 */
export interface NotificationChannel {
  /** Unique channel identifier */
  id: string;
  /** Display name */
  name: string;
  /** Channel description */
  description?: string;
  /** Channel icon */
  icon?: string;
  /** Configuration schema */
  configSchema?: Record<string, unknown>;
  /** Send notification handler */
  send: (notification: NotificationPayload, config: Record<string, unknown>) => Promise<boolean>;
}

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  type: string;
  data?: Record<string, unknown>;
}

/**
 * Admin page definition for plugin settings/dashboard
 */
export interface AdminPageDefinition {
  /** Page identifier */
  id: string;
  /** Display title */
  title: string;
  /** Menu icon */
  icon?: string;
  /** Page path (will be prefixed with /admin/plugins/{pluginName}) */
  path: string;
  /** React component to render (as string path for dynamic import) */
  component: string;
  /** Required role to access */
  role?: Role;
  /** Sort order in menu */
  order?: number;
}

/**
 * Calendar view extension
 */
export interface CalendarExtension {
  /** Extension identifier */
  id: string;
  /** Display name */
  name: string;
  /** Additional data to show in assignment cards */
  getAssignmentExtra?: (assignmentId: string) => Promise<Record<string, unknown>>;
  /** Custom assignment card component */
  cardComponent?: string;
}

/**
 * Report definition for reporting plugin
 */
export interface ReportDefinition {
  /** Report identifier */
  id: string;
  /** Report name */
  name: string;
  /** Report description */
  description?: string;
  /** Report category */
  category?: string;
  /** Report parameters schema */
  parameters?: Record<string, unknown>;
  /** Generate report handler */
  generate: (params: Record<string, unknown>) => Promise<ReportResult>;
}

export interface ReportResult {
  /** Report title */
  title: string;
  /** Report data */
  data: unknown;
  /** Export formats available */
  formats: ('pdf' | 'csv' | 'xlsx' | 'json')[];
  /** Generated at timestamp */
  generatedAt: Date;
}

/**
 * API data source for monitoring
 */
export interface ApiDataSource {
  /** Data source identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Base URL */
  baseUrl: string;
  /** Authentication config */
  auth?: {
    type: 'api-key' | 'bearer' | 'basic' | 'oauth2';
    config: Record<string, unknown>;
  };
  /** Fetch data handler */
  fetch: (endpoint: string, params?: Record<string, unknown>) => Promise<unknown>;
  /** Health check */
  healthCheck?: () => Promise<boolean>;
}

/**
 * All extension points a plugin can register
 */
export interface ExtensionPoints {
  /** API routes */
  routes?: RouteDefinition[];
  /** WebSocket handlers */
  webSocketHandlers?: WebSocketHandler[];
  /** Scheduled jobs */
  scheduledJobs?: ScheduledJob[];
  /** Notification channels */
  notificationChannels?: NotificationChannel[];
  /** Admin pages */
  adminPages?: AdminPageDefinition[];
  /** Calendar extensions */
  calendarExtensions?: CalendarExtension[];
  /** Reports */
  reports?: ReportDefinition[];
  /** API data sources */
  apiDataSources?: ApiDataSource[];
}
