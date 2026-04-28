// ===========================================
// Enums (mirrored from Prisma for frontend use)
// ===========================================

export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  SCHEDULER = 'SCHEDULER',
  REQUESTER = 'REQUESTER',
  MEMBER = 'MEMBER',
  UNASSIGNED = 'UNASSIGNED',
}

export enum DisplayStatus {
  SCHEDULED = 'SCHEDULED',
  UNSCHEDULED = 'UNSCHEDULED',
  FORECAST = 'FORECAST',
}

export enum ScheduleFilterMode {
  /** No restriction — every member's assignments are visible. */
  ALL = 'ALL',
  /** Visibility = linked member ∪ selected departments' members ∪ explicitly selected members. */
  CUSTOM = 'CUSTOM',
}

export interface ScheduleFilterPreference {
  mode: ScheduleFilterMode;
  /** Resolved Member.id for the user — auto-filled by email match, admin-overridable. Always included in CUSTOM mode. */
  linkedMemberId?: string;
  /** Free-text department names whose members should be visible in CUSTOM mode. */
  departments?: string[];
  /** Explicit member ids to make visible in CUSTOM mode. */
  memberIds?: string[];
}

// ===========================================
// Base Types
// ===========================================

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// User Types
// ===========================================

export interface User extends BaseEntity {
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  role: Role;
  isActive: boolean;
  mustResetPassword: boolean;
  ssoProvider?: string | null;
  preferences: Record<string, unknown>;
  lastLogin?: Date | null;
  lastPasswordChange?: Date | null;
}

export interface UserCreateInput {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  role?: Role;
  mustResetPassword?: boolean;
  preferences?: Record<string, unknown>;
}

export interface UserUpdateInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  role?: Role;
  isActive?: boolean;
  mustResetPassword?: boolean;
  preferences?: Record<string, unknown>;
}

// ===========================================
// Password Management Types
// ===========================================

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
}

// ===========================================
// Member Types
// ===========================================

export interface WorkingHours {
  start: string; // "09:00"
  end: string; // "17:00"
}

export interface MemberWorkingHours {
  mon?: WorkingHours;
  tue?: WorkingHours;
  wed?: WorkingHours;
  thu?: WorkingHours;
  fri?: WorkingHours;
  sat?: WorkingHours;
  sun?: WorkingHours;
}

export interface Member extends BaseEntity {
  employeeId?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  managerId?: string | null;
  manager?: Pick<Member, 'id' | 'firstName' | 'lastName'> | null;
  resume?: string | null;
  certification?: string | null;
  training?: string | null;
  education?: string | null;
  notes?: string | null;
  isActive: boolean;
  workingHours?: MemberWorkingHours | null;
  metadata: Record<string, unknown>;
  skills?: MemberSkill[];
  projectRoles?: MemberProjectRole[];
}

export interface MemberCreateInput {
  employeeId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  managerId?: string;
  resume?: string;
  certification?: string;
  training?: string;
  education?: string;
  notes?: string;
  workingHours?: MemberWorkingHours;
}

export interface MemberUpdateInput {
  employeeId?: string | null;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  managerId?: string | null;
  resume?: string | null;
  certification?: string | null;
  training?: string | null;
  education?: string | null;
  notes?: string | null;
  isActive?: boolean;
  workingHours?: MemberWorkingHours | null;
}

// ===========================================
// Assignment Types
// ===========================================

export interface Assignment extends BaseEntity {
  title: string;
  description?: string | null;
  startDate: Date;
  endDate: Date;
  projectTypeId: string;
  displayStatus: DisplayStatus;
  metadata: Record<string, unknown>;
  createdById: string;
}

export interface AssignmentWithRelations extends Assignment {
  projectType: ProjectType;
  createdBy: User;
  members: AssignmentMember[];
  requiredSkills: AssignmentSkill[];
  formatters?: AssignmentFormatter[];
  projectRoles?: AssignmentProjectRole[];
}

export interface AssignmentMember {
  id: string;
  assignmentId: string;
  memberId: string;
  member?: Member;
}

export interface AssignmentSkill {
  id: string;
  assignmentId: string;
  skillId: string;
  required: boolean;
  skill?: Skill;
}

export interface AssignmentCreateInput {
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  projectTypeId: string;
  memberIds: string[];
  skillIds?: string[];
  formatterIds?: string[];
  projectRoleIds?: string[];
}

export interface AssignmentUpdateInput {
  title?: string;
  description?: string | null;
  startDate?: Date;
  endDate?: Date;
  projectTypeId?: string;
  displayStatus?: DisplayStatus;
  memberIds?: string[];
  skillIds?: string[];
  formatterIds?: string[];
  projectRoleIds?: string[];
}

// ===========================================
// Project Type Field Configuration
// ===========================================

/** Configuration for a single field's visibility and required status */
export interface FieldSettings {
  visible: boolean;
  required: boolean;
  /** Optional value template with {value} placeholder, e.g. "https://jira.example.com/browse/{value}" */
  valueTemplate?: string;
}

/** All configurable request form fields */
export type ConfigurableRequestField =
  | 'jiraId'
  | 'kantataId'
  | 'clientName'
  | 'urlLink'
  | 'requestedStartDate'
  | 'requestedEndDate'
  | 'timezone'
  | 'travelRequired'
  | 'studentCount'
  | 'format'
  | 'location'
  | 'preparationWeeks'
  | 'executionWeeks'
  | 'reportingWeeks'
  | 'requiredMembers'
  | 'requiredSkills'
  | 'description';

/** Field configuration map for a project type */
export type ProjectTypeFieldConfig = Partial<Record<ConfigurableRequestField, FieldSettings>>;

/** Default field configuration - all visible, none required */
export const DEFAULT_FIELD_CONFIG: Required<Record<ConfigurableRequestField, FieldSettings>> = {
  jiraId: { visible: true, required: false },
  kantataId: { visible: true, required: false },
  clientName: { visible: true, required: false },
  urlLink: { visible: true, required: false },
  requestedStartDate: { visible: true, required: false },
  requestedEndDate: { visible: true, required: false },
  timezone: { visible: true, required: false },
  travelRequired: { visible: true, required: false },
  studentCount: { visible: true, required: false },
  format: { visible: true, required: false },
  location: { visible: true, required: false },
  preparationWeeks: { visible: true, required: false },
  executionWeeks: { visible: true, required: false },
  reportingWeeks: { visible: true, required: false },
  requiredMembers: { visible: true, required: false },
  requiredSkills: { visible: true, required: false },
  description: { visible: true, required: false },
};

/** Human-readable labels for configurable fields */
export const FIELD_LABELS: Record<ConfigurableRequestField, string> = {
  jiraId: 'Jira ID',
  kantataId: 'Kantata ID',
  clientName: 'Client Name',
  urlLink: 'URL Link',
  requestedStartDate: 'Start Date',
  requestedEndDate: 'End Date',
  timezone: 'Timezone',
  travelRequired: 'Travel Required',
  studentCount: 'Student Count',
  format: 'Format',
  location: 'Location',
  preparationWeeks: 'Preparation Weeks',
  executionWeeks: 'Execution Weeks',
  reportingWeeks: 'Reporting Weeks',
  requiredMembers: 'Required Members',
  requiredSkills: 'Required Skills',
  description: 'Description',
};

/** Resolve a value template by replacing {value} with the field value */
export function resolveValueTemplate(template: string, value: string): string {
  return template.replaceAll('{value}', value);
}

// ===========================================
// Project Type
// ===========================================

export interface ProjectType {
  id: string;
  name: string;
  abbreviation?: string | null;
  color: string;
  description?: string | null;
  isActive: boolean;
  fieldConfig?: ProjectTypeFieldConfig | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectTypeCreateInput {
  name: string;
  abbreviation?: string;
  color?: string;
  description?: string;
  fieldConfig?: ProjectTypeFieldConfig;
}

export interface ProjectTypeUpdateInput {
  name?: string;
  abbreviation?: string | null;
  color?: string;
  description?: string | null;
  isActive?: boolean;
  fieldConfig?: ProjectTypeFieldConfig | null;
}

// ===========================================
// Formatter Types
// ===========================================

export interface Formatter {
  id: string;
  name: string;
  isBold: boolean;
  prefix?: string | null;
  suffix?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  projectRoles?: FormatterProjectRole[];
}

export interface FormatterCreateInput {
  name: string;
  isBold?: boolean;
  prefix?: string;
  suffix?: string;
  projectRoleIds?: string[];
}

export interface FormatterUpdateInput {
  name?: string;
  isBold?: boolean;
  prefix?: string | null;
  suffix?: string | null;
  isActive?: boolean;
  projectRoleIds?: string[];
}

export interface AssignmentFormatter {
  id: string;
  assignmentId: string;
  formatterId: string;
  formatter?: Formatter;
}

// Junction table from Formatter's perspective
export interface FormatterProjectRole {
  id: string;
  projectRoleId: string;
  formatterId: string;
  projectRole?: ProjectRole;
}

// Junction table from ProjectRole's perspective
export interface ProjectRoleFormatter {
  id: string;
  projectRoleId: string;
  formatterId: string;
  formatter?: Formatter;
}

// ===========================================
// Skill Types
// ===========================================

export interface Skill {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  isActive: boolean;
  externalId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberSkill {
  id: string;
  memberId: string;
  skillId: string;
  level: number;
  skill?: Skill;
}

export interface MemberProjectRole {
  id: string;
  memberId: string;
  projectRoleId: string;
  dateAwarded?: Date | null;
  createdAt: Date;
  projectRole?: ProjectRole;
}

export interface SkillCreateInput {
  name: string;
  category?: string;
  description?: string;
}

export interface SkillUpdateInput {
  name?: string;
  category?: string | null;
  description?: string | null;
  isActive?: boolean;
}

// ===========================================
// Project Role Types
// ===========================================

export interface ProjectRole {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  formatters?: ProjectRoleFormatter[];
}

export interface ProjectRoleCreateInput {
  name: string;
  description?: string;
  color?: string;
  formatterIds?: string[];
}

export interface ProjectRoleUpdateInput {
  name?: string;
  description?: string | null;
  color?: string | null;
  isActive?: boolean;
  formatterIds?: string[];
}

export interface AssignmentProjectRole {
  id: string;
  assignmentId: string;
  projectRoleId: string;
  projectRole?: ProjectRole;
}

// ===========================================
// Notification Types
// ===========================================

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
}

export enum NotificationType {
  ASSIGNMENT = 'ASSIGNMENT',
  SYSTEM = 'SYSTEM',
  ALERT = 'ALERT',
}

// ===========================================
// Request Types
// ===========================================

export enum RequestStatus {
  UNSCHEDULED = 'UNSCHEDULED',
  SCHEDULED = 'SCHEDULED',
  FORECAST = 'FORECAST',
  CANCELLED = 'CANCELLED',
}

export interface RequestMember {
  id: string;
  requestId: string;
  memberId: string;
  member?: Member;
}

export interface RequestSkill {
  id: string;
  requestId: string;
  skillId: string;
  skill?: Skill;
}

export interface Request extends BaseEntity {
  title: string;
  description?: string | null;
  status: RequestStatus;
  requesterId: string;
  requester?: User;

  // Project details
  requestedStartDate?: Date | null;
  requestedEndDate?: Date | null;
  projectId?: string | null;
  clientName?: string | null;
  projectName?: string | null;
  projectTypeId?: string | null;
  projectType?: ProjectType;

  // Timeline
  executionWeeks: number;
  preparationWeeks: number;
  reportingWeeks: number;

  // Resource requirements
  requiredMemberCount: number;

  // Additional details
  travelRequired: boolean;
  travelLocation?: string | null;
  timezone?: string | null;
  urlLink?: string | null;
  studentCount: number;
  format?: string | null;
  location?: string | null;

  // Relations
  requiredMembers?: RequestMember[];
  requiredSkills?: RequestSkill[];
}

export interface RequestCreateInput {
  title: string;
  status?: RequestStatus;
  description?: string;
  requestedStartDate?: Date;
  requestedEndDate?: Date;
  projectId?: string;
  clientName?: string;
  projectName?: string;
  projectTypeId?: string;
  memberIds?: string[];
  requiredMemberCount?: number;
  skillIds?: string[];
  executionWeeks?: number;
  preparationWeeks?: number;
  reportingWeeks?: number;
  travelRequired?: boolean;
  travelLocation?: string;
  timezone?: string;
  urlLink?: string;
  studentCount?: number;
  format?: string;
  location?: string;
}

export interface RequestUpdateInput {
  title?: string;
  description?: string | null;
  status?: RequestStatus;
  requestedStartDate?: Date | null;
  requestedEndDate?: Date | null;
  projectId?: string | null;
  clientName?: string | null;
  projectName?: string | null;
  projectTypeId?: string | null;
  memberIds?: string[];
  requiredMemberCount?: number;
  skillIds?: string[];
  executionWeeks?: number;
  preparationWeeks?: number;
  reportingWeeks?: number;
  travelRequired?: boolean;
  travelLocation?: string | null;
  timezone?: string | null;
  urlLink?: string | null;
  studentCount?: number;
  format?: string | null;
  location?: string | null;
}

// ===========================================
// Audit Log Types
// ===========================================

/** JSON value type compatible with Prisma's JsonValue */
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject { [key: string]: JsonValue; }
export type JsonArray = JsonValue[];

export interface AuditLog {
  id: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: JsonValue;
  newValue?: JsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata: JsonValue;
  createdAt: Date;
  user?: User | null;
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  VIEW = 'VIEW',
}

// ===========================================
// Auth Types
// ===========================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface TokenPayload {
  sub: string; // User ID
  email: string;
  role: Role;
  iat: number;
  exp: number;
}

// ===========================================
// API Response Types
// ===========================================

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  details?: Record<string, unknown>;
}

// ===========================================
// Calendar Types
// ===========================================

export interface CalendarQuery {
  startDate: Date;
  endDate: Date;
  memberIds?: string[];
  projectTypeIds?: string[];
  displayStatuses?: DisplayStatus[];
}

export interface CalendarDay {
  date: Date;
  dayOfWeek: number; // 0-6 (Sun-Sat)
  isWeekend: boolean;
  isToday: boolean;
}

export interface CalendarWeek {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  days: CalendarDay[];
}

// ===========================================
// WebSocket Event Types
// ===========================================

export enum WebSocketEvent {
  ASSIGNMENT_CREATED = 'assignment:created',
  ASSIGNMENT_UPDATED = 'assignment:updated',
  ASSIGNMENT_DELETED = 'assignment:deleted',
  REQUEST_CREATED = 'request:created',
  REQUEST_UPDATED = 'request:updated',
  REQUEST_DELETED = 'request:deleted',
  MEMBER_CREATED = 'member:created',
  MEMBER_UPDATED = 'member:updated',
  MEMBER_DELETED = 'member:deleted',
  NOTIFICATION_NEW = 'notification:new',
  SYSTEM_ANNOUNCEMENT = 'system:announcement',
  // Cell Selection Presence Events
  SELECTION_UPDATE = 'selection:update',
  SELECTION_CLEAR = 'selection:clear',
  PRESENCE_SYNC = 'presence:sync',
  // Assignment Selection Presence Events
  ASSIGNMENT_SELECTION_UPDATE = 'assignment:selection:update',
  ASSIGNMENT_SELECTION_CLEAR = 'assignment:selection:clear',
}

export interface WebSocketMessage<T = unknown> {
  event: WebSocketEvent;
  data: T;
  timestamp: Date;
}

// ===========================================
// Presence Types (for collaborative cell selection)
// ===========================================

/** Represents a user's identity for presence display */
export interface PresenceUser {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  color: string;
}

/** A user's current cell selection state */
export interface CellSelection {
  userId: string;
  user: PresenceUser;
  selectedDays: string[];           // Array of ISO date strings
  selectedMemberId: string | null;  // null = column mode, string = row mode
  timestamp: number;
}

/** Payload for selection:update event (client -> server) */
export interface SelectionUpdatePayload {
  scheduleRoomId: string;
  selection: Omit<CellSelection, 'user'>;
}

/** Payload for presence:sync event (server -> client on join) */
export interface PresenceSyncPayload {
  selections: CellSelection[];
  assignmentSelections: AssignmentSelection[];
}

// ===========================================
// Assignment Selection Presence Types
// ===========================================

/** A user's current assignment selection state */
export interface AssignmentSelection {
  userId: string;
  user: PresenceUser;
  assignmentId: string;
  memberId: string | null; // The member row context for the selection
  timestamp: number;
}

/** Payload for assignment:selection:update event (client -> server) */
export interface AssignmentSelectionUpdatePayload {
  scheduleRoomId: string;
  selection: Omit<AssignmentSelection, 'user'>;
}

/** Payload for assignment:selection:clear event (client -> server) */
export interface AssignmentSelectionClearPayload {
  scheduleRoomId: string;
}

// ===========================================
// Integration & Extension Types (re-export)
// ===========================================

export * from './integrations';
export * from './audit-events';

// ===========================================
// Data Ingestion Types (re-export)
// ===========================================

export * from './ingestion';

// ===========================================
// QUIP Integration Types (re-export)
// ===========================================

export * from './quip';

// ===========================================
// Resume Import Types (re-export)
// ===========================================

export * from './resume';

// ===========================================
// Schedule Backup Types (re-export)
// ===========================================

export * from './backup';
