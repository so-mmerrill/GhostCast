import { SetMetadata } from '@nestjs/common';

export const DEPARTMENTS_KEY = 'departments';

/**
 * Restrict a route to users whose `department` matches one of the given values.
 * Combine with @Roles for role+department gating.
 */
export const Departments = (...departments: string[]) =>
  SetMetadata(DEPARTMENTS_KEY, departments);
