// ===========================================
// Data Ingestion Types
// ===========================================

import { MemberWorkingHours, RequestStatus } from './index';

// ===========================================
// Enums
// ===========================================

/**
 * Strategy for handling conflicts when ingesting data
 */
export enum ConflictStrategy {
  /** Skip records that already exist (no changes made) */
  SKIP = 'SKIP',
  /** Update existing records with new data */
  UPDATE = 'UPDATE',
  /** Fail the entire ingestion if any conflict exists */
  FAIL = 'FAIL',
}

/**
 * Processing mode for ingestion
 */
export enum ProcessingMode {
  /** Process synchronously - blocks until complete */
  SYNC = 'SYNC',
  /** Process asynchronously - returns job ID for status polling */
  ASYNC = 'ASYNC',
}

/**
 * Status of an individual record during ingestion
 */
export enum IngestionRecordStatus {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}

/**
 * Status of an async ingestion job
 */
export enum IngestionJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// ===========================================
// Ingestion Entity Types
// ===========================================

/**
 * Skill data for ingestion
 */
export interface IngestionSkill {
  /** External system identifier for mapping */
  externalId: string;
  name: string;
  category?: string;
  description?: string;
}

/**
 * Project type data for ingestion
 */
export interface IngestionProjectType {
  /** External system identifier for mapping */
  externalId: string;
  name: string;
  color?: string;
  description?: string;
}

/**
 * Formatter data for ingestion
 */
export interface IngestionFormatter {
  /** External system identifier for mapping */
  externalId: string;
  name: string;
  isBold?: boolean;
  prefix?: string;
  suffix?: string;
}

/**
 * Member data for ingestion
 */
export interface IngestionMember {
  /** External system identifier for mapping */
  externalId: string;
  employeeId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  workingHours?: MemberWorkingHours;
  metadata?: Record<string, unknown>;
  /** External skill IDs (will be resolved to internal IDs) */
  skillExternalIds?: string[];
  /** Skill proficiency levels (maps to skillExternalIds by index) */
  skillLevels?: number[];
}

/**
 * Assignment data for ingestion
 */
export interface IngestionAssignment {
  /** External system identifier for mapping */
  externalId: string;
  title: string;
  description?: string;
  /** ISO date string */
  startDate: string;
  /** ISO date string */
  endDate: string;
  /** External project type ID (will be resolved to internal ID) */
  projectTypeExternalId: string;
  /** External member IDs (will be resolved to internal IDs) */
  memberExternalIds: string[];
  /** External skill IDs (will be resolved to internal IDs) */
  skillExternalIds?: string[];
  /** External formatter IDs (will be resolved to internal IDs) */
  formatterExternalIds?: string[];
  /** External request ID (will be resolved to internal ID) */
  requestExternalId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request data for ingestion
 */
export interface IngestionRequest {
  /** External system identifier for mapping */
  externalId: string;
  title: string;
  description?: string;
  status?: RequestStatus;
  /** ISO date string */
  requestedStartDate?: string;
  projectId?: string;
  clientName?: string;
  projectName?: string;
  /** External project type ID (will be resolved to internal ID) */
  projectTypeExternalId?: string;
  /** External member IDs (will be resolved to internal IDs) */
  memberExternalIds?: string[];
  /** External skill IDs (will be resolved to internal IDs) */
  skillExternalIds?: string[];
  executionWeeks?: number;
  preparationWeeks?: number;
  reportingWeeks?: number;
  travelRequired?: boolean;
  timezone?: string;
  urlLink?: string;
}

// ===========================================
// Ingestion Options and Payload
// ===========================================

/**
 * Options for controlling ingestion behavior
 */
export interface IngestionOptions {
  /** Plugin/integration name that initiated the ingestion */
  source: string;
  /** How to handle conflicts (default: SKIP) */
  conflictStrategy: ConflictStrategy;
  /** Processing mode (default: SYNC) */
  processingMode: ProcessingMode;
  /** Whether to validate without committing (default: false) */
  dryRun: boolean;
  /** Whether to continue processing on errors (default: true) */
  continueOnError?: boolean;
  /** Batch size for processing (default: 100) */
  batchSize?: number;
  /** User ID who triggered the ingestion */
  triggeredBy?: string;
}

/**
 * Data to be ingested, organized by entity type
 */
export interface IngestionData {
  skills?: IngestionSkill[];
  projectTypes?: IngestionProjectType[];
  formatters?: IngestionFormatter[];
  members?: IngestionMember[];
  assignments?: IngestionAssignment[];
  requests?: IngestionRequest[];
}

/**
 * Complete ingestion payload
 */
export interface IngestionPayload {
  options: IngestionOptions;
  data: IngestionData;
}

// ===========================================
// Ingestion Results
// ===========================================

/**
 * Result of ingesting a single record
 */
export interface IngestionRecordResult {
  /** External ID from the source system */
  externalId: string;
  /** Internal ID in GhostCast (if created/updated) */
  internalId?: string;
  /** Status of this record */
  status: IngestionRecordStatus;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of ingesting a single entity type
 */
export interface IngestionEntityResult {
  /** Entity type name */
  entity: string;
  /** Total records processed */
  total: number;
  /** Records created */
  created: number;
  /** Records updated */
  updated: number;
  /** Records skipped (already exist) */
  skipped: number;
  /** Records that failed */
  failed: number;
  /** Individual record results */
  records: IngestionRecordResult[];
}

/**
 * Summary of the entire ingestion operation
 */
export interface IngestionSummary {
  totalRecords: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

/**
 * Complete ingestion result
 */
export interface IngestionResult {
  /** Whether the ingestion succeeded overall */
  success: boolean;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Processing mode used */
  processingMode: ProcessingMode;
  /** Job ID for async processing */
  jobId?: string;
  /** When the ingestion started */
  startedAt: Date;
  /** When the ingestion completed */
  completedAt?: Date;
  /** Duration in milliseconds */
  duration?: number;
  /** Aggregated summary */
  summary: IngestionSummary;
  /** Results per entity type */
  entities: IngestionEntityResult[];
  /** Global errors that occurred */
  errors: string[];
}

// ===========================================
// External ID Mapping
// ===========================================

/**
 * Mapping between external and internal IDs
 */
export interface ExternalIdMapping {
  id: string;
  /** Plugin/integration source name */
  source: string;
  /** Entity type (Member, Skill, etc.) */
  entityType: string;
  /** External system ID */
  externalId: string;
  /** GhostCast internal ID */
  internalId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// Ingestion Job (for async processing)
// ===========================================

/**
 * Async ingestion job record
 */
export interface IngestionJob {
  id: string;
  source: string;
  status: IngestionJobStatus;
  triggeredBy?: string;
  payload: IngestionPayload;
  result?: IngestionResult;
  progress: number;
  errorMessage?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// ===========================================
// Processing Context (internal use)
// ===========================================

/**
 * Context passed to processors during ingestion
 */
export interface ProcessingContext {
  /** Plugin/integration source name */
  source: string;
  /** Conflict handling strategy */
  conflictStrategy: ConflictStrategy;
  /** Whether to continue on errors */
  continueOnError: boolean;
  /** Map of 'entityType:externalId' -> internalId for resolved references */
  idMap: Map<string, string>;
  /** Whether this is a dry run */
  dryRun: boolean;
}
