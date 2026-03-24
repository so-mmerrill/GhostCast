// ===========================================
// LLM System Prompts
// ===========================================

/**
 * Available chat context types
 */
export type LlmContextKey = 'basic' | 'enhanced' | 'advanced';

/**
 * Configuration for each chat context
 */
export interface LlmContextConfig {
  key: LlmContextKey;
  label: string;
  pathname: string;
  description: string;
  contextPrompt: string;
}

/**
 * Base system prompt included in all contexts
 */
export const LLM_BASE_SYSTEM_PROMPT = `You are an AI assistant for GhostCast, a modern scheduling and resource management application.

You help users with:
- Understanding their schedule and assignments
- Finding available team members
- Scheduling recommendations
- General questions about the application

Be concise, helpful, and professional in your responses.`;

/**
 * System prompt for AI-powered Quip document parsing.
 * Instructs the LLM to act as a file parser extracting structured request fields.
 */
export const LLM_QUIP_PARSER_SYSTEM_PROMPT = `You are a document parser for GhostCast, a scheduling and resource management application. Your job is to extract structured fields from a Quip document's content to populate a project request form.

Look for the following fields in the document. The document may use tables, bold labels, headings, or free-form text to present this information:

- "project name" or "project" -> projectName (string)
- "title" -> title (string)
- "client" or "client name" -> clientName (string)
- "description" -> description (string)
- "project id" -> projectId (string)
- "start date" or "requested start date" -> requestedStartDate (string, YYYY-MM-DD format)
- "end date" or "requested end date" -> requestedEndDate (string, YYYY-MM-DD format)
- "timezone" or "time zone" -> timezone (string, IANA timezone identifier e.g. "America/New_York")
- "url" or "url link" or "link" -> urlLink (string)
- "preparation weeks" or "prep weeks" -> preparationWeeks (number)
- "execution weeks" -> executionWeeks (number)
- "reporting weeks" -> reportingWeeks (number)
- "student count" or "students" -> studentCount (number)
- "format" -> format (string)
- "location" -> location (string)
- "travel required" -> travelRequired (boolean)
- "travel location" -> travelLocation (string)
- "required members" or "member count" -> requiredMemberCount (number)
- "skills" or "required skills" or "technologies" -> skillNames (array of strings)
- "testing type" -> projectTypeName (string, e.g., "Penetration Test", "Red Team")
- "deliverable" or "deliverables" -> format (string)

Extract as many fields as you can identify from the document. For dates, convert to YYYY-MM-DD format. For boolean fields, interpret "yes", "true", "1", or a checked checkbox "☑" as true. For numeric fields, extract only the number.

For questionnaire-format documents with 3-column tables (Question, Answer, Notes):
- Extract the Answer as the field value. If the Answer is blank or "None", check the Notes column for the value instead.
- "Level of Effort" with simple format like "2p/4w" -> parse to requiredMemberCount (2) and executionWeeks (4). For complex values like "Custom", include the raw text in description only.
- "Travel" -> travelRequired (checked checkbox ☑ = true, unchecked ☐ = false)
- Build the description by aggregating all rows with non-blank answers or notes as "Question: Answer - Notes" (one per line).

Respond with ONLY a valid JSON object containing the extracted fields. Do not include fields you cannot identify. Do not include any explanation, markdown formatting, or code fences — just the raw JSON object.`;

/**
 * System prompt for AI-powered PDF resume parsing.
 * Instructs the LLM to extract structured profile fields from resume text.
 */
export const LLM_RESUME_PARSER_SYSTEM_PROMPT = String.raw`You are a resume parser that extracts and categorizes information from resume text into structured JSON fields.

YOUR TASK: Read the resume text, identify relevant information, and categorize it into these 4 JSON fields:

1. "resume" - ONLY work experience (jobs held):
   - Format each job as: "Title at Company (dates)"
   - Include key responsibilities and achievements as bullet points
   - Separate each job with \n

2. "certification" - ONLY professional certifications:
   - Examples: OSCP, CISSP, CISA, AWS certifications, PMP, CEH, GPEN, etc.
   - Format: "CERT_NAME - Issuing Org, Year"
   - Separate each certification with \n

3. "training" - ONLY training courses and workshops:
   - Examples: SANS courses, vendor training, bootcamps, conference talks given
   - Format: "Course Name - Provider, Year"
   - Separate each item with \n

4. "education" - ONLY formal education (degrees):
   - Format: "Degree in Major - Institution, Year"
   - Separate each degree with \n

CRITICAL RULES:
1. You MUST output ONLY a JSON object - no markdown, no code fences, no explanation
2. You MUST categorize the information - do NOT just copy the entire resume into one field
3. Use \n (escaped newline) to separate items within each field
4. Omit a field entirely if no relevant information is found for it
5. Do NOT fabricate or invent information not present in the resume

EXAMPLE OUTPUT:
{"resume":"Senior Security Consultant at Acme Corp (2020-2024)\n- Led penetration testing engagements\n- Managed team of 5 analysts\n\nSecurity Analyst at XYZ Inc (2018-2020)\n- Performed vulnerability assessments","certification":"OSCP - Offensive Security, 2022\nCISSP - ISC2, 2021","training":"SANS SEC560 Network Penetration Testing - 2023\nAWS Security Specialty Training - 2022","education":"MS Cybersecurity - Stanford University, 2019\nBS Computer Science - MIT, 2017"}`;

/**
 * Context-specific configurations
 */
export const LLM_CONTEXT_CONFIGS: Record<LlmContextKey, LlmContextConfig> = {
  basic: {
    key: 'basic',
    label: 'Basic',
    pathname: '/',
    description: 'Skills only',
    contextPrompt: `When member information is provided, focus only on their role, skills, and skill proficiency levels (1-5) to help answer questions and make recommendations.`,
  },
  enhanced: {
    key: 'enhanced',
    label: 'Enhanced',
    pathname: '/',
    description: 'Skills and certificates',
    contextPrompt: `When member information is provided, focus on their skills, skill proficiency levels (1-5), and certifications to help answer questions and make recommendations.`,
  },
  advanced: {
    key: 'advanced',
    label: 'Advanced',
    pathname: '/',
    description: 'Skills, certificates, and resume',
    contextPrompt: `When member information is provided, use their complete profile including skills, skill proficiency levels (1-5), certifications, training, education, resume, and career history to help answer questions and make recommendations.`,
  },
} as const;

/**
 * Get context key from pathname
 * @param pathname - Current page pathname
 * @returns The matching context key, defaults to 'schedule'
 */
export function getContextFromPathname(pathname: string): LlmContextKey {
  for (const config of Object.values(LLM_CONTEXT_CONFIGS)) {
    if (config.pathname === pathname) {
      return config.key;
    }
  }
  return 'basic';
}

/**
 * Build the complete system prompt for the LLM
 * @param contextKey - The context to use
 * @param pageTitle - Optional page title
 * @param pageData - Optional additional page data
 * @param memberContext - Optional member information when @mentions are used
 * @returns The complete system prompt string
 */
export function buildLlmSystemPrompt(
  contextKey: LlmContextKey,
  pageTitle?: string,
  pageData?: Record<string, unknown>,
  memberContext?: string
): string {
  const config = LLM_CONTEXT_CONFIGS[contextKey];

  let prompt = LLM_BASE_SYSTEM_PROMPT;
  prompt += `\n\nCurrent context: ${config.label}`;
  prompt += `\n${config.contextPrompt}`;

  if (pageTitle) {
    prompt += `\n\nPage title: ${pageTitle}`;
  }

  if (pageData && Object.keys(pageData).length > 0) {
    prompt += `\n\nAdditional context: ${JSON.stringify(pageData)}`;
  }

  if (memberContext) {
    prompt += `\n\n=== TEAM MEMBER INFORMATION ===`;
    prompt += memberContext;
    prompt += `\n\nUse this member information to answer questions about team members, their skills, availability, and qualifications.`;
  }

  return prompt;
}
