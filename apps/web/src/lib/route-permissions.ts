import { Role } from '@ghostcast/shared';

export interface RoutePermission {
  /** Minimum role required to access this route */
  minRole: Role;
  /** Optional: specific roles allowed (overrides minRole if set) */
  allowedRoles?: Role[];
}

/**
 * Centralized route permissions configuration.
 *
 * Routes not listed here default to requiring MEMBER role.
 * The login page is outside the _authenticated layout and doesn't need to be listed.
 *
 * Role hierarchy (lowest to highest): MEMBER < SCHEDULER < MANAGER < ADMIN
 */
export const ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  // Schedule page - all authenticated users can view
  '/': { minRole: Role.MEMBER },

  // Members page - all authenticated users can view
  '/members': { minRole: Role.MEMBER },

  // Admin page - admin only
  '/admin': { minRole: Role.ADMIN },

  // Requests page - requester and above
  '/requests': { minRole: Role.REQUESTER },

  // Dashboards page - managers and above
  '/dashboards': { minRole: Role.MANAGER },

  // Integrations page - all users (users see only user-scoped plugins, admins see all)
  '/integrations': { minRole: Role.MEMBER },
};

/** Default permission for routes not explicitly configured */
export const DEFAULT_ROUTE_PERMISSION: RoutePermission = {
  minRole: Role.MEMBER,
};

/** Role hierarchy for permission checks (higher index = higher permission) */
const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.UNASSIGNED]: -1,
  [Role.MEMBER]: 0,
  [Role.REQUESTER]: 1,
  [Role.SCHEDULER]: 2,
  [Role.MANAGER]: 3,
  [Role.ADMIN]: 4,
};

/**
 * Check if a user's role meets the minimum required role
 */
export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Check if a user has permission to access a route
 */
export function canAccessRoute(userRole: Role, pathname: string): boolean {
  const permission = ROUTE_PERMISSIONS[pathname] ?? DEFAULT_ROUTE_PERMISSION;

  // If specific roles are defined, check against those
  if (permission.allowedRoles && permission.allowedRoles.length > 0) {
    return permission.allowedRoles.includes(userRole);
  }

  // Otherwise check against minimum role
  return hasMinimumRole(userRole, permission.minRole);
}

/**
 * Get the permission config for a route
 */
export function getRoutePermission(pathname: string): RoutePermission {
  return ROUTE_PERMISSIONS[pathname] ?? DEFAULT_ROUTE_PERMISSION;
}
