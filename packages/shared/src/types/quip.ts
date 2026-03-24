// ===========================================
// QUIP Integration Types
// ===========================================

/** Represents an item in the QUIP file browser (folder or document) */
export interface QuipBrowserItem {
  id: string;
  title: string;
  type: 'folder' | 'document';
  /** ISO timestamp of last update */
  updatedAt?: string;
}

/** Breadcrumb entry for folder navigation */
export interface QuipBreadcrumb {
  id: string;
  title: string;
}

/** Response from the QUIP browse endpoint */
export interface QuipBrowseResponse {
  folderId: string;
  folderTitle: string;
  items: QuipBrowserItem[];
  breadcrumbs: QuipBreadcrumb[];
}

/** Result of parsing a QUIP document into request fields */
export interface QuipParsedRequestFields {
  title?: string;
  description?: string;
  projectName?: string;
  clientName?: string;
  projectId?: string;
  requestedStartDate?: string;
  requestedEndDate?: string;
  timezone?: string;
  urlLink?: string;
  preparationWeeks?: number;
  executionWeeks?: number;
  reportingWeeks?: number;
  studentCount?: number;
  format?: string;
  location?: string;
  travelRequired?: boolean;
  travelLocation?: string;
  requiredMemberCount?: number;
  /** Skill names (to be resolved to IDs on the frontend) */
  skillNames?: string[];
  /** Project type name (to be resolved to a projectTypeId on the frontend) */
  projectTypeName?: string;
  /** Raw HTML for optional preview */
  rawHtml?: string;
}

/** Status of the user's QUIP configuration */
export interface QuipConfigStatus {
  configured: boolean;
  integrationInstalled: boolean;
  integrationEnabled: boolean;
  /** Whether AI-powered parsing is available for this user */
  aiEnabled: boolean;
}
