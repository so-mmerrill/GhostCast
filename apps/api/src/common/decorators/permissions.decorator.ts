import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete';
}

/**
 * Decorator to specify required permissions for a route
 */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Shorthand decorators for common permissions
 */
export const CanCreate = (resource: string) =>
  Permissions({ resource, action: 'create' });

export const CanRead = (resource: string) =>
  Permissions({ resource, action: 'read' });

export const CanUpdate = (resource: string) =>
  Permissions({ resource, action: 'update' });

export const CanDelete = (resource: string) =>
  Permissions({ resource, action: 'delete' });
