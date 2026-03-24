import type {
  Assignment,
  AssignmentCreateInput,
  Member,
  User,
  Notification,
  AuditEvent,
} from '@ghostcast/shared';

/**
 * Context provided to hook handlers
 */
export interface HookContext {
  /** Current authenticated user (if any) */
  user?: User;
  /** Request ID for tracing */
  requestId: string;
  /** Timestamp of the event */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Hook result for hooks that can modify data
 */
export interface HookResult<T = unknown> {
  /** Whether to continue processing */
  continue: boolean;
  /** Modified data (if applicable) */
  data?: T;
  /** Error message if continue is false */
  error?: string;
}

/**
 * All available plugin hooks
 */
export interface PluginHooks {
  // ===========================================
  // Assignment Hooks
  // ===========================================

  /**
   * Called before an assignment is created
   * Can modify the input or prevent creation
   */
  onBeforeAssignmentCreate?(
    input: AssignmentCreateInput,
    context: HookContext
  ): Promise<HookResult<AssignmentCreateInput>>;

  /**
   * Called after an assignment is created
   */
  onAfterAssignmentCreate?(
    assignment: Assignment,
    context: HookContext
  ): Promise<void>;

  /**
   * Called before an assignment is updated
   */
  onBeforeAssignmentUpdate?(
    id: string,
    changes: Partial<Assignment>,
    context: HookContext
  ): Promise<HookResult<Partial<Assignment>>>;

  /**
   * Called after an assignment is updated
   */
  onAfterAssignmentUpdate?(
    assignment: Assignment,
    changes: Partial<Assignment>,
    context: HookContext
  ): Promise<void>;

  /**
   * Called before an assignment is deleted
   */
  onBeforeAssignmentDelete?(
    id: string,
    context: HookContext
  ): Promise<HookResult>;

  /**
   * Called after an assignment is deleted
   */
  onAfterAssignmentDelete?(
    id: string,
    context: HookContext
  ): Promise<void>;

  // ===========================================
  // Member Hooks
  // ===========================================

  /**
   * Called after a member is created
   */
  onMemberCreate?(
    member: Member,
    context: HookContext
  ): Promise<void>;

  /**
   * Called after a member is updated
   */
  onMemberUpdate?(
    member: Member,
    changes: Partial<Member>,
    context: HookContext
  ): Promise<void>;

  /**
   * Called after a member is deleted
   */
  onMemberDelete?(
    id: string,
    context: HookContext
  ): Promise<void>;

  // ===========================================
  // User/Auth Hooks
  // ===========================================

  /**
   * Called after a user logs in
   */
  onUserLogin?(
    user: User,
    context: HookContext
  ): Promise<void>;

  /**
   * Called after a user logs out
   */
  onUserLogout?(
    user: User,
    context: HookContext
  ): Promise<void>;

  /**
   * Called after a user is created
   */
  onUserCreate?(
    user: User,
    context: HookContext
  ): Promise<void>;

  /**
   * Called after a user is updated
   */
  onUserUpdate?(
    user: User,
    changes: Partial<User>,
    context: HookContext
  ): Promise<void>;

  // ===========================================
  // Notification Hooks
  // ===========================================

  /**
   * Called before a notification is sent
   * Can modify the notification or add additional channels
   */
  onBeforeNotificationSend?(
    notification: Notification,
    context: HookContext
  ): Promise<HookResult<Notification>>;

  /**
   * Called after a notification is sent
   */
  onAfterNotificationSend?(
    notification: Notification,
    context: HookContext
  ): Promise<void>;

  // ===========================================
  // System Hooks
  // ===========================================

  /**
   * Called on application startup
   */
  onAppStart?(): Promise<void>;

  /**
   * Called on application shutdown
   */
  onAppShutdown?(): Promise<void>;

  /**
   * Called periodically for scheduled tasks
   * @param cronExpression - The cron expression that triggered this call
   */
  onScheduledTask?(cronExpression: string): Promise<void>;

  // ===========================================
  // Audit Event Hooks (for Extensions)
  // ===========================================

  /**
   * Called when an audit event is created.
   * Extensions can subscribe to receive notifications about
   * changes in the system (assignments created, members updated, etc.)
   */
  onAuditEvent?(event: AuditEvent): Promise<void>;
}

/**
 * Hook priority for ordering multiple handlers
 */
export enum HookPriority {
  HIGHEST = 0,
  HIGH = 25,
  NORMAL = 50,
  LOW = 75,
  LOWEST = 100,
}

/**
 * Hook handler registration
 */
export interface HookHandler<T extends keyof PluginHooks = keyof PluginHooks> {
  pluginName: string;
  hook: T;
  handler: PluginHooks[T];
  priority: HookPriority;
}
