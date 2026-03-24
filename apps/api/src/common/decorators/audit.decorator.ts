import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditOptions {
  /** Action name for audit log */
  action: string;
  /** Entity type being audited */
  entity: string;
  /** Whether to skip audit logging */
  skip?: boolean;
}

/**
 * Decorator to configure audit logging for a route
 */
export const Audit = (options: AuditOptions) => SetMetadata(AUDIT_KEY, options);

/**
 * Decorator to skip audit logging for a route
 */
export const SkipAudit = () => SetMetadata(AUDIT_KEY, { skip: true });
