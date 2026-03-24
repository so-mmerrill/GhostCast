import { ConflictStrategy } from '@ghostcast/shared';

/**
 * Kantata role from API response
 */
export interface KantataRole {
  id: string;
  name: string;
}

/**
 * Kantata custom field value from API response
 */
export interface KantataCustomFieldValue {
  id: string;
  subject_type: string;
  subject_id: string;
  custom_field_id: string;
  custom_field_name?: string;
  display_value?: string;
  type?: string;
  value?: string | number | boolean | null;
}

/**
 * Kantata user from API response
 */
export interface KantataUser {
  id: string;
  full_name: string;
  email_address: string;
  headline?: string;
  disabled: boolean;
  manager_id?: string;
  account_id?: string;
  role_id?: string;
  skill_ids?: string[];
  photo_path?: string;
  bio?: string;
  city?: string;
  country?: string;
  classification?: string;
  custom_field_value_ids?: string[];
}

/**
 * Kantata API response for users endpoint
 */
export interface KantataUsersResponse {
  count?: number;
  users: Record<string, KantataUser>;
  roles?: Record<string, KantataRole>;
  custom_field_values?: Record<string, KantataCustomFieldValue>;
  // We ignore these but they may be present in the response
  skills?: Record<string, unknown>;
  skill_memberships?: Record<string, unknown>;
  managers?: Record<string, unknown>;
}

/**
 * Configuration for Kantata sync
 */
export interface KantataSyncConfig {
  oauthToken: string;
  apiBaseUrl: string;
  conflictStrategy: ConflictStrategy;
  deactivateMissing: boolean;
  syncDateFilterType?: 'created_after' | 'updated_after';
  syncDateFilterValue?: string;
}

/**
 * Result of a sync operation
 */
export interface KantataSyncResult {
  success: boolean;
  startedAt: Date;
  completedAt: Date;
  summary: {
    totalRecords: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  deactivated?: number;
  managersLinked?: number;
  errors: string[];
}

/**
 * Result of fetching all users from Kantata API
 */
export interface KantataFetchResult {
  users: KantataUser[];
  roles: Map<string, KantataRole>;
  customFieldValues: Map<string, KantataCustomFieldValue>;
}

/**
 * Kantata skill from API response
 */
export interface KantataSkill {
  id: string;
  name: string;
  description: string;
}

/**
 * Kantata API response for skills endpoint
 */
export interface KantataSkillsResponse {
  count?: number;
  skills: Record<string, KantataSkill>;
}

/**
 * Result of fetching all skills from Kantata API
 */
export interface KantataSkillsFetchResult {
  skills: KantataSkill[];
}

/**
 * Kantata skill membership from API response
 */
export interface KantataSkillMembership {
  id: string;
  skill_id: string;
  user_id: string;
  level: number;
  max_level: number;
  cached_skill_name: string;
  creator_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Kantata API response for users with skills endpoint
 */
export interface KantataUsersWithSkillsResponse extends KantataUsersResponse {
  skills: Record<string, KantataSkill>;
  skill_memberships: Record<string, KantataSkillMembership>;
}

/**
 * Result of fetching all users with skills from Kantata API
 */
export interface KantataUsersWithSkillsFetchResult {
  users: KantataUser[];
  skills: Map<string, KantataSkill>;
  skillMemberships: KantataSkillMembership[];
}

/**
 * Kantata workspace (project) from API response
 */
export interface KantataWorkspace {
  id: string;
  title: string;
  description?: string;
  start_date?: string;
  due_date?: string;
  status?: {
    message?: string;
    color?: string;
  };
  archived?: boolean;
}

/**
 * Kantata story (milestone or task) from API response
 */
export interface KantataStory {
  id: string;
  title: string;
  description?: string;
  story_type: 'milestone' | 'task';
  state?: string;
  workspace_id: string;
  parent_id?: string | null;
  start_date?: string;
  due_date?: string;
  sub_story_count?: number;
  sub_story_ids?: string[];
  current_assignment_ids?: string[];
  assignee_ids?: string[];
  archived?: boolean;
  created_at?: string;
  updated_at?: string;
  // Populated after processing
  _assignments?: KantataStoryAssignment[];
}

/**
 * Kantata assignment from API response
 */
export interface KantataStoryAssignment {
  id: string;
  story_id: string;
  assignee_id?: string;
  // Populated after processing
  _assignee?: KantataUser;
}

/**
 * Kantata API response for stories endpoint
 */
export interface KantataStoriesResponse {
  count?: number;
  results?: Array<{ key: string; id: string }>;
  stories?: Record<string, KantataStory>;
  workspaces?: Record<string, KantataWorkspace>;
  users?: Record<string, KantataUser>;
  assignments?: Record<string, KantataStoryAssignment>;
}

/**
 * Kantata API response for assignments endpoint
 */
export interface KantataAssignmentsResponse {
  count?: number;
  assignments?: Record<string, KantataStoryAssignment>;
  users?: Record<string, KantataUser>;
}

/**
 * Result of fetching all stories from Kantata API
 */
export interface KantataStoriesFetchResult {
  stories: KantataStory[];
  workspaces: Record<string, KantataWorkspace>;
  users: Record<string, KantataUser>;
  assignments: Record<string, KantataStoryAssignment>;
}

/**
 * Processed project with phases
 */
export interface KantataProcessedProject {
  title: string;
  workspaceId: string;
  start_date?: string;
  due_date?: string;
  executionPhases?: KantataProcessedPhase[];
  reportingPhases?: KantataProcessedPhase[];
  assessments?: KantataProcessedAssessment[];
  milestones?: KantataProcessedMilestone[];
}

/**
 * Processed phase (Execution or Reporting)
 */
export interface KantataProcessedPhase {
  title: string;
  storyId: string;
  start_date?: string;
  due_date?: string;
  assignees: KantataProcessedAssignee[];
}

/**
 * Processed assessment (for nested projects)
 */
export interface KantataProcessedAssessment {
  assessment: {
    title: string;
    storyId: string;
    start_date?: string;
    due_date?: string;
  };
  executionPhases: KantataProcessedPhase[];
  reportingPhases: KantataProcessedPhase[];
}

/**
 * Processed milestone
 */
export interface KantataProcessedMilestone {
  title: string;
  storyId: string;
  start_date?: string;
  due_date?: string;
  assignees: KantataProcessedAssignee[];
}

/**
 * Processed assignee with role information
 */
export interface KantataProcessedAssignee {
  name: string;
  userId: string;
  roles?: string;
  role?: string;
  start_date?: string;
  due_date?: string;
}

/**
 * Kantata time off entry from API response
 */
export interface KantataTimeOffEntry {
  id: string;
  requested_date: string;
  submission_date: string;
  hours: number;
  user_id: string;
}

/**
 * Kantata API response for time_off_entries endpoint
 */
export interface KantataTimeOffResponse {
  count: number;
  results: Array<{ key: string; id: string }>;
  time_off_entries: Record<string, KantataTimeOffEntry>;
  users?: Record<string, KantataUser>;
  meta: {
    count: number;
    page_count: number;
    page_number: number;
    page_size: number;
  };
}

/**
 * Result of fetching all time off entries from Kantata API
 */
export interface KantataTimeOffFetchResult {
  entries: KantataTimeOffEntry[];
  users: Record<string, KantataUser>;
}

/**
 * Kantata holiday from API response
 */
export interface KantataHoliday {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD (may be same as start_date)
  paid: boolean;
  total_hours: number;
  holiday_calendar_association_ids?: string[];
}

/**
 * Kantata holiday calendar association from API response
 */
export interface KantataHolidayCalendarAssociation {
  id: string;
  holiday_id: string;
  holiday_calendar_id: string;
}

/**
 * Kantata holiday calendar from API response
 */
export interface KantataHolidayCalendar {
  id: string;
  name: string;
  user_ids?: string[];
}

/**
 * Kantata API response for holidays endpoint
 */
export interface KantataHolidaysResponse {
  count: number;
  results: Array<{ key: string; id: string }>;
  holidays: Record<string, KantataHoliday>;
  holiday_calendar_associations?: Record<string, KantataHolidayCalendarAssociation>;
  holiday_calendars?: Record<string, KantataHolidayCalendar>;
  meta: {
    count: number;
    page_count: number;
    page_number: number;
    page_size: number;
  };
}

/**
 * Kantata API response for holiday_calendars endpoint
 */
export interface KantataHolidayCalendarsResponse {
  count: number;
  results: Array<{ key: string; id: string }>;
  holiday_calendars: Record<string, KantataHolidayCalendar>;
  meta: {
    count: number;
    page_count: number;
    page_number: number;
    page_size: number;
  };
}

/**
 * Result of fetching all holidays from Kantata API
 */
export interface KantataHolidaysFetchResult {
  holidays: KantataHoliday[];
  /** Map of holiday ID to array of Kantata user IDs */
  holidayUserIds: Map<string, string[]>;
  /** Map of calendar ID to calendar object */
  calendars: Map<string, KantataHolidayCalendar>;
  /** Map of holiday ID to array of calendar IDs */
  holidayCalendarIds: Map<string, string[]>;
}
