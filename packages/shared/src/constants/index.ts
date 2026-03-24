// ===========================================
// Role Permissions
// ===========================================

import { Role } from '../types/index';

export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.UNASSIGNED]: -1,
  [Role.MEMBER]: 0,
  [Role.REQUESTER]: 1,
  [Role.SCHEDULER]: 2,
  [Role.MANAGER]: 3,
  [Role.ADMIN]: 4,
};

export const ROLE_PERMISSIONS = {
  [Role.ADMIN]: {
    users: ['create', 'read', 'update', 'delete'],
    members: ['create', 'read', 'update', 'delete'],
    assignments: ['create', 'read', 'update', 'delete'],
    projectTypes: ['create', 'read', 'update', 'delete'],
    skills: ['create', 'read', 'update', 'delete'],
    auditLogs: ['read'],
    systemConfig: ['read', 'update'],
    plugins: ['create', 'read', 'update', 'delete'],
    integrations: ['create', 'read', 'update', 'delete'],
  },
  [Role.MANAGER]: {
    users: ['read'],
    members: ['create', 'read', 'update', 'delete'],
    assignments: ['create', 'read', 'update', 'delete'],
    projectTypes: ['read'],
    skills: ['read'],
    auditLogs: ['read'],
    systemConfig: [],
    plugins: [],
    integrations: [],
  },
  [Role.SCHEDULER]: {
    users: [],
    members: ['read'],
    assignments: ['create', 'read', 'update', 'delete'],
    projectTypes: ['read'],
    skills: ['read'],
    auditLogs: [],
    systemConfig: [],
    plugins: [],
    integrations: [],
  },
  [Role.REQUESTER]: {
    users: [],
    members: ['read'],
    assignments: ['read'],
    projectTypes: ['read'],
    skills: ['read'],
    auditLogs: [],
    systemConfig: [],
    plugins: [],
    integrations: [],
  },
  [Role.MEMBER]: {
    users: [],
    members: ['read'],
    assignments: ['read'],
    projectTypes: ['read'],
    skills: ['read'],
    auditLogs: [],
    systemConfig: [],
    plugins: [],
    integrations: [],
  },
  [Role.UNASSIGNED]: {
    users: [],
    members: [],
    assignments: [],
    projectTypes: [],
    skills: [],
    auditLogs: [],
    systemConfig: [],
    plugins: [],
    integrations: [],
  },
} as const;

// ===========================================
// Calendar Constants
// ===========================================

export const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export const DAYS_OF_WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const QUARTERS = [
  { name: 'Q1', months: [0, 1, 2] },
  { name: 'Q2', months: [3, 4, 5] },
  { name: 'Q3', months: [6, 7, 8] },
  { name: 'Q4', months: [9, 10, 11] },
] as const;

// Work week days (Monday = 1, Friday = 5)
export const WORK_WEEK_START = 1;
export const WORK_WEEK_END = 5;

// ===========================================
// API Routes
// ===========================================

export const API_ROUTES = {
  // Auth
  AUTH_LOGIN: '/auth/login',
  AUTH_LOGOUT: '/auth/logout',
  AUTH_REFRESH: '/auth/refresh',
  AUTH_ME: '/auth/me',
  AUTH_SAML: '/auth/saml',

  // Users
  USERS: '/users',
  USER_BY_ID: (id: string) => `/users/${id}`,

  // Members
  MEMBERS: '/members',
  MEMBER_BY_ID: (id: string) => `/members/${id}`,
  MEMBER_SKILLS: (id: string) => `/members/${id}/skills`,
  MEMBER_UNAVAILABILITY: (id: string) => `/members/${id}/unavailability`,

  // Assignments
  ASSIGNMENTS: '/assignments',
  ASSIGNMENT_BY_ID: (id: string) => `/assignments/${id}`,
  ASSIGNMENTS_CALENDAR: '/assignments/calendar',

  // Project Types
  PROJECT_TYPES: '/project-types',
  PROJECT_TYPE_BY_ID: (id: string) => `/project-types/${id}`,

  // Skills
  SKILLS: '/skills',
  SKILL_BY_ID: (id: string) => `/skills/${id}`,

  // Notifications
  NOTIFICATIONS: '/notifications',
  NOTIFICATION_BY_ID: (id: string) => `/notifications/${id}`,
  NOTIFICATIONS_MARK_READ: '/notifications/mark-read',

  // Audit Logs
  AUDIT_LOGS: '/audit-logs',

  // Admin / System Config
  SYSTEM_CONFIG: '/admin/config',
  SYSTEM_CONFIG_BY_KEY: (key: string) => `/admin/config/${key}`,

  // Plugins (legacy admin)
  PLUGINS: '/admin/plugins',
  PLUGIN_BY_ID: (id: string) => `/admin/plugins/${id}`,
  PLUGIN_ENABLE: (id: string) => `/admin/plugins/${id}/enable`,
  PLUGIN_DISABLE: (id: string) => `/admin/plugins/${id}/disable`,

  // Integrations & Extensions Store
  INTEGRATIONS_CATALOG: '/integrations/catalog',
  INTEGRATIONS_INSTALLED: '/integrations/installed',
  INTEGRATION_BY_ID: (id: string) => `/integrations/${id}`,
  INTEGRATION_INSTALL: (catalogId: string) => `/integrations/${catalogId}/install`,
  INTEGRATION_UNINSTALL: (id: string) => `/integrations/${id}`,
  INTEGRATION_ENABLE: (id: string) => `/integrations/${id}/enable`,
  INTEGRATION_DISABLE: (id: string) => `/integrations/${id}/disable`,
  INTEGRATION_CONFIG: (id: string) => `/integrations/${id}/config`,
  INTEGRATION_HEALTH: (id: string) => `/integrations/${id}/health`,
} as const;

// ===========================================
// Validation Constants
// ===========================================

export const VALIDATION = {
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 100,
  TITLE_MIN_LENGTH: 1,
  TITLE_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 5000,
  EMAIL_MAX_LENGTH: 255,
} as const;

// ===========================================
// Default Values
// ===========================================

export const DEFAULTS = {
  PROJECT_TYPE_COLOR: '#3B82F6',
  PAGINATION_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  SKILL_LEVEL_MIN: 1,
  SKILL_LEVEL_MAX: 5,
  TOKEN_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
} as const;

// ===========================================
// Status Colors
// ===========================================

export const STATUS_COLORS = {
  SCHEDULED: '#3B82F6', // Blue
  IN_PROGRESS: '#F59E0B', // Amber
  COMPLETED: '#10B981', // Green
  CANCELLED: '#6B7280', // Gray
} as const;

// Request status colors for assignment display
export const REQUEST_STATUS_COLORS = {
  UNSCHEDULED: { background: '#FFFFFF', border: '#000000' }, // White with black border
  FORECAST: { background: '#FEF08A', border: '#000000' }, // Soft yellow with black border
  NO_REQUEST: { background: '#6B7280', border: null }, // Gray (for assignments not linked to a request)
} as const;

// ===========================================
// LLM Prompts
// ===========================================

export * from './llm-prompts';
