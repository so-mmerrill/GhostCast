import type { AuditLog } from './index';

// ===========================================
// Audit Event Types for Extensions
// ===========================================

export interface AuditEventContext {
  requestId: string;
  timestamp: Date;
  userId?: string;
  userRole?: string;
  userName?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEvent {
  auditLog: AuditLog;
  context: AuditEventContext;
}

// ===========================================
// Audit Event Filter for Extensions
// ===========================================

export interface AuditEventFilter {
  /** Filter by specific actions (e.g., ['CREATE', 'UPDATE']) */
  actions?: string[];
  /** Filter by specific entities (e.g., ['Assignment', 'Member']) */
  entities?: string[];
  /** Filter by specific user IDs */
  userIds?: string[];
}
