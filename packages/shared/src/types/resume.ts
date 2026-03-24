/**
 * Parsed resume fields extracted from a PDF resume using AI
 */
export interface ParsedResumeFields {
  /** Work experience, job titles, companies, responsibilities */
  resume?: string;
  /** Professional certifications with issuers and dates */
  certification?: string;
  /** Training courses, workshops, professional development */
  training?: string;
  /** Degrees, institutions, graduation years, honors */
  education?: string;
}

/**
 * Response from the PDF resume parse endpoint
 */
export interface ParseResumeResponse extends ParsedResumeFields {
  /** Original extracted text from the PDF for reference */
  rawText?: string;
}

/**
 * Request to apply parsed resume fields to a member
 */
export interface ApplyResumeRequest extends ParsedResumeFields {
  /** If true, replace existing fields; if false, append to existing */
  replaceExisting?: boolean;
}
