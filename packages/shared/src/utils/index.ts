import { Role } from '../types/index';
import { ROLE_HIERARCHY, ROLE_PERMISSIONS, WORK_WEEK_START, WORK_WEEK_END } from '../constants/index';

// ===========================================
// Role Utilities
// ===========================================

/**
 * Check if a role has a specific permission on a resource
 */
export function hasPermission(
  role: Role,
  resource: keyof (typeof ROLE_PERMISSIONS)[Role],
  action: string
): boolean {
  const permissions = ROLE_PERMISSIONS[role]?.[resource];
  if (!permissions) return false;
  return permissions.includes(action as never);
}

/**
 * Check if role A is higher than or equal to role B in hierarchy
 */
export function isRoleAtLeast(currentRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Get all roles that a given role can manage
 */
export function getManagedRoles(role: Role): Role[] {
  const hierarchy = ROLE_HIERARCHY[role];
  return Object.entries(ROLE_HIERARCHY)
    .filter(([_, level]) => level < hierarchy)
    .map(([r]) => r as Role);
}

// ===========================================
// Date Utilities
// ===========================================

/**
 * Check if a date falls on a weekday (Mon-Fri)
 */
export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= WORK_WEEK_START && day <= WORK_WEEK_END;
}

/**
 * Get the start of a quarter for a given date
 */
export function getQuarterStart(date: Date): Date {
  const month = date.getMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth, 1);
}

/**
 * Get the end of a quarter for a given date
 */
export function getQuarterEnd(date: Date): Date {
  const month = date.getMonth();
  const quarterEndMonth = Math.floor(month / 3) * 3 + 2;
  return new Date(date.getFullYear(), quarterEndMonth + 1, 0);
}

/**
 * Get the quarter number (1-4) for a date
 */
export function getQuarter(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

/**
 * Get all weekdays between two dates (inclusive)
 */
export function getWeekdaysBetween(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);

  while (current <= end) {
    if (isWeekday(current)) {
      dates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

/**
 * Get the Monday of the week for a given date
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

/**
 * Get the Friday of the week for a given date
 */
export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return end;
}

// ===========================================
// String Utilities
// ===========================================

/**
 * Get initials from a full name
 */
export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/**
 * Get full name from first and last name
 */
export function getFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Slugify a string (for URLs, keys, etc.)
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/[\s_-]+/g, '-')
    .replaceAll(/(^-+)|(-+$)/g, '');
}

// ===========================================
// Object Utilities
// ===========================================

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return structuredClone(obj);
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj } as Omit<T, K>;
  for (const key of keys) {
    delete (result as Record<string, unknown>)[key as string];
  }
  return result;
}

// ===========================================
// Color Utilities
// ===========================================

/**
 * Generate a contrasting text color (black or white) for a background
 */
export function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = Number.parseInt(hex.substring(0, 2), 16);
  const g = Number.parseInt(hex.substring(2, 4), 16);
  const b = Number.parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Lighten or darken a hex color
 */
export function adjustColor(hexColor: string, percent: number): string {
  const hex = hexColor.replace('#', '');
  const num = Number.parseInt(hex, 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;

  const clampedR = Math.max(0, Math.min(255, R));
  const clampedG = Math.max(0, Math.min(255, G));
  const clampedB = Math.max(0, Math.min(255, B));

  return `#${(
    0x1000000 +
    clampedR * 0x10000 +
    clampedG * 0x100 +
    clampedB
  )
    .toString(16)
    .slice(1)}`;
}
