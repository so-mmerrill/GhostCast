import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as https from 'https';
import { MembersService } from '../members/members.service';
import { RequestsService } from '../requests/requests.service';
import { UserSettingsService } from '../user-settings/user-settings.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { ProjectTypesService } from '../project-types/project-types.service';
import { PrismaService } from '../../database/prisma.service';
import {
  buildLlmSystemPrompt,
  getContextFromPathname,
  LlmContextKey,
  LLM_QUIP_PARSER_SYSTEM_PROMPT,
  LLM_RESUME_PARSER_SYSTEM_PROMPT,
  ParsedResumeFields,
  QuipParsedRequestFields,
  Role,
} from '@ghostcast/shared';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PageContext {
  pathname: string;
  pageTitle?: string;
  pageData?: Record<string, unknown>;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface MemberWithDetails {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  department?: string | null;
  position?: string | null;
  notes?: string | null;
  resume?: string | null;
  certification?: string | null;
  training?: string | null;
  education?: string | null;
  skills?: Array<{
    level: number;
    skill?: {
      name: string;
    } | null;
  }>;
  projectRoles?: Array<{
    projectRole?: {
      name: string;
    } | null;
  }>;
}

interface RequestWithDetails {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  clientName?: string | null;
  projectName?: string | null;
  requestedStartDate?: Date | null;
  requestedEndDate?: Date | null;
  executionWeeks: number;
  preparationWeeks: number;
  reportingWeeks: number;
  requiredMemberCount: number;
  travelRequired: boolean;
  travelLocation?: string | null;
  notes?: string | null;
  projectType?: {
    name: string;
  } | null;
  requiredSkills?: Array<{
    skill?: {
      id: string;
      name: string;
    } | null;
  }>;
  requiredMembers?: Array<{
    member?: {
      id: string;
      firstName: string;
      lastName: string;
    } | null;
  }>;
}

@Injectable()
export class LlmChatService {
  private readonly logger = new Logger(LlmChatService.name);
  private readonly httpsAgent = new https.Agent({ rejectUnauthorized: false });

  constructor(
    private readonly httpService: HttpService,
    private readonly userSettingsService: UserSettingsService,
    private readonly membersService: MembersService,
    private readonly requestsService: RequestsService,
    private readonly assignmentsService: AssignmentsService,
    private readonly projectTypesService: ProjectTypesService,
    private readonly prisma: PrismaService,
  ) {}

  async chat(
    userId: string,
    messages: ChatMessage[],
    pageContext?: PageContext,
    contextOverride?: LlmContextKey,
    mentionedMemberIds?: string[],
    mentionedRequestIds?: string[],
    userRole?: Role,
  ): Promise<string> {
    // Get user-specific configuration for the AI Assistant plugin
    const config = await this.userSettingsService.getAllSettings(userId, 'openai-llm');

    if (!config?.apiKey) {
      throw new BadRequestException(
        'AI Assistant is not configured. Please configure the integration in the Integrations page.',
      );
    }

    const baseUrl = (config.baseUrl as string) || 'https://bedrock.icp.specterops.io:7443/v1';
    const model = (config.model as string) || 'bedrock-claude-4-5-sonnet';

    // Determine the context key
    const contextKey = contextOverride ||
      (pageContext?.pathname ? getContextFromPathname(pageContext.pathname) : 'basic');

    // Always fetch all active members for context
    const allMembers = await this.fetchAllMembersWithDetails();

    // Inspect the latest user message to drive both quote-resolution and date-range extraction
    const latestUserMessage = this.getLatestUserMessage(messages);
    const detectedRange = latestUserMessage
      ? this.extractDateRange(latestUserMessage.content, new Date())
      : null;

    // Resolve quoted client/project names from the latest user message into request IDs
    const resolvedRequestIds = await this.resolveQuotedClientMatches(
      latestUserMessage?.content ?? '',
      mentionedRequestIds ?? [],
    );

    // Fetch mentioned + resolved requests
    const mentionedRequests = resolvedRequestIds.length
      ? await this.fetchRequestsWithDetails(resolvedRequestIds)
      : [];

    // Skip baseline if the user named a specific member AND a date range — strictly less useful
    // than the focused member-scoped fetch and avoids loading every member for that range.
    const skipBaseline = !!detectedRange && (mentionedMemberIds?.length ?? 0) > 0;

    // Fetch project types and assignment context (baseline + per-mention)
    const [projectTypes, baselineAssignments, mentionedMemberAssignments, requestAssignments] =
      await Promise.all([
        this.fetchProjectTypes(),
        skipBaseline
          ? Promise.resolve(null)
          : this.fetchBaselineAssignments(userRole, detectedRange),
        this.fetchMemberScopedAssignments(mentionedMemberIds ?? [], userRole, detectedRange),
        this.fetchRequestScopedAssignments(resolvedRequestIds),
      ]);

    // Build request context with matching members
    const requestContext = this.buildRequestContext(mentionedRequests, allMembers);

    // Build member context - highlight mentioned members if any
    const memberContext = this.buildMemberContext(
      allMembers,
      contextKey,
      mentionedMemberIds,
    );

    // Build new schedule-aware context sections
    const projectTypeContext = this.buildProjectTypeContext(projectTypes);
    const baselineAssignmentContext = this.buildBaselineAssignmentContext(baselineAssignments);
    const memberAssignmentContext = this.buildMemberAssignmentContext(mentionedMemberAssignments);
    const requestAssignmentContext = this.buildRequestAssignmentContext(requestAssignments);

    // Combine all context. Order: project types, schedule windows, then existing member/request data.
    const fullContext =
      projectTypeContext +
      baselineAssignmentContext +
      memberAssignmentContext +
      requestAssignmentContext +
      requestContext +
      memberContext;

    // Build system prompt with page context
    const systemPrompt = buildLlmSystemPrompt(
      contextKey,
      pageContext?.pageTitle,
      pageContext?.pageData,
      fullContext,
    );

    const messagesWithSystem: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    try {
      const response = await firstValueFrom(
        this.httpService.post<OpenAIResponse>(
          `${baseUrl}/chat/completions`,
          {
            model,
            messages: messagesWithSystem,
            temperature: 0.7,
            max_tokens: 2000,
          },
          {
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000,
            httpsAgent: this.httpsAgent,
          },
        ),
      );

      return response.data.choices[0]?.message?.content || '';
    } catch (error: unknown) {
      throw this.handleLlmApiError(error, baseUrl, 'chat');
    }
  }

  /**
   * Parse a Quip document's HTML using the LLM to extract structured request fields.
   */
  async parseQuipDocument(userId: string, documentText: string): Promise<QuipParsedRequestFields> {
    const config = await this.userSettingsService.getAllSettings(userId, 'openai-llm');

    if (!config?.apiKey) {
      throw new BadRequestException(
        'AI Assistant is not configured. Please configure the integration in the Integrations page.',
      );
    }

    const baseUrl =
      (config.baseUrl as string) ||
      'https://bedrock.icp.specterops.io:7443/v1';
    const model =
      (config.model as string) || 'bedrock-claude-4-5-sonnet';

    const messages: ChatMessage[] = [
      { role: 'system', content: LLM_QUIP_PARSER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Parse the following Quip document and extract structured fields:\n\n${documentText}`,
      },
    ];

    try {
      const response = await firstValueFrom(
        this.httpService.post<OpenAIResponse>(
          `${baseUrl}/chat/completions`,
          {
            model,
            messages,
            temperature: 0.2,
            max_tokens: 2000,
          },
          {
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000,
            httpsAgent: this.httpsAgent,
          },
        ),
      );

      const responseText =
        response.data.choices[0]?.message?.content || '{}';

      return this.parseJsonResponse<QuipParsedRequestFields>(responseText, 'document');
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      throw this.handleLlmApiError(error, baseUrl, 'document parsing');
    }
  }

  /**
   * Parse a PDF resume's text content using the LLM to extract structured profile fields.
   */
  async parseResumeDocument(userId: string, resumeText: string): Promise<ParsedResumeFields> {
    const config = await this.userSettingsService.getAllSettings(userId, 'openai-llm');

    if (!config?.apiKey) {
      throw new BadRequestException(
        'AI Assistant is not configured. Please configure the integration in the Integrations page.',
      );
    }

    const baseUrl =
      (config.baseUrl as string) ||
      'https://bedrock.icp.specterops.io:7443/v1';
    const model =
      (config.model as string) || 'bedrock-claude-4-5-sonnet';

    const messages: ChatMessage[] = [
      { role: 'system', content: LLM_RESUME_PARSER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Parse the following resume text and extract structured profile fields:\n\n${resumeText}`,
      },
    ];

    try {
      const response = await firstValueFrom(
        this.httpService.post<OpenAIResponse>(
          `${baseUrl}/chat/completions`,
          {
            model,
            messages,
            temperature: 0.2,
            max_tokens: 4000,
          },
          {
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 120000, // 2 minutes for longer resumes
            httpsAgent: this.httpsAgent,
          },
        ),
      );

      const responseText =
        response.data.choices[0]?.message?.content || '{}';

      this.logger.log('LLM resume parsed');

      return this.parseJsonResponse<ParsedResumeFields>(responseText, 'resume');
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      throw this.handleLlmApiError(error, baseUrl, 'resume parsing');
    }
  }

  /**
   * Parse JSON response with multiple fallback strategies
   */
  private parseJsonResponse<T>(responseText: string, context: string): T {
    const jsonText = this.extractJsonFromResponse(responseText);

    const directParse = this.tryParseJson<T>(jsonText);
    if (directParse !== null) {
      return directParse;
    }

    const sanitizedParse = this.tryParseJson<T>(this.sanitizeJsonStringValues(jsonText));
    if (sanitizedParse !== null) {
      return sanitizedParse;
    }

    this.logger.warn(`Failed to parse LLM ${context} response as JSON`, {
      responseText: responseText.substring(0, 1000),
      jsonText: jsonText.substring(0, 500),
    });
    throw new BadRequestException(
      `AI failed to parse the ${context} into structured fields. Please try again.`,
    );
  }

  /**
   * Extract JSON from LLM response text using multiple strategies
   */
  private extractJsonFromResponse(responseText: string): string {
    let jsonText = responseText.trim();

    // Strategy 1: Strip markdown code fences
    jsonText = jsonText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Strategy 2: Find JSON object in the response
    if (!jsonText.startsWith('{')) {
      const jsonMatch = /\{[\s\S]*\}/.exec(responseText);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
    }

    return jsonText;
  }

  /**
   * Try to parse JSON, returning null on failure instead of throwing
   */
  private tryParseJson<T>(jsonText: string): T | null {
    try {
      return JSON.parse(jsonText) as T;
    } catch {
      return null;
    }
  }

  /**
   * Handle LLM API errors with consistent error messages
   */
  private handleLlmApiError(error: unknown, baseUrl: string, context: string): never {
    const err = error as {
      response?: { status?: number; data?: unknown };
      message?: string;
      code?: string;
    };

    this.logger.error(`LLM API error during ${context}:`, {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
      code: err.code,
    });

    if (err.response?.status === 401) {
      throw new BadRequestException(
        'Invalid API key. Please check your API key configuration.',
      );
    }

    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      throw new BadRequestException(
        `Cannot connect to LLM API at ${baseUrl}. Please check the API Base URL configuration.`,
      );
    }

    const responseData = err.response?.data as Record<string, unknown> | undefined;
    const errorMessage =
      (responseData?.error as { message?: string })?.message ||
      (responseData?.message as string) ||
      err.message ||
      'Failed to get response from LLM API';

    throw new BadRequestException(errorMessage);
  }

  /** Map of control characters to their escaped JSON equivalents */
  private static readonly CONTROL_CHAR_ESCAPES: ReadonlyMap<string, string> = new Map([
    ['\n', String.raw`\n`],
    ['\r', String.raw`\r`],
    ['\t', String.raw`\t`],
  ]);

  /**
   * Sanitize JSON string values by escaping unescaped control characters.
   * LLMs sometimes return JSON with literal newlines/tabs inside string values,
   * which is invalid JSON. This method escapes them properly.
   */
  private sanitizeJsonStringValues(jsonText: string): string {
    let result = '';
    let inString = false;

    for (let i = 0; i < jsonText.length; i++) {
      const char = jsonText.charAt(i);

      if (char === '"' && !this.isEscapedQuote(jsonText, i)) {
        inString = !inString;
        result += char;
      } else if (inString) {
        result += this.escapeControlChar(char);
      } else {
        result += char;
      }
    }

    return result;
  }

  /** Check if a quote at position i is escaped by counting preceding backslashes */
  private isEscapedQuote(text: string, quoteIndex: number): boolean {
    let backslashCount = 0;
    for (let j = quoteIndex - 1; j >= 0 && text[j] === '\\'; j--) {
      backslashCount++;
    }
    return backslashCount % 2 !== 0;
  }

  /** Escape a control character if needed, otherwise return as-is */
  private escapeControlChar(char: string): string {
    return LlmChatService.CONTROL_CHAR_ESCAPES.get(char) ?? char;
  }

  /**
   * Fetch all active members with full details including skills
   */
  private async fetchAllMembersWithDetails(): Promise<MemberWithDetails[]> {
    // Get all active members
    const result = await this.membersService.findAll({
      page: 1,
      pageSize: 500,
      memberStatus: 'active',
    });

    const members: MemberWithDetails[] = [];

    // Fetch full details for each member (including skills with levels)
    for (const basicMember of result.data) {
      try {
        const fullMember = await this.membersService.findById(basicMember.id);
        members.push(fullMember as MemberWithDetails);
      } catch {
        // Skip members that fail to load
      }
    }

    return members;
  }

  /**
   * Build context-specific member information
   * @param members - All members to include
   * @param contextKey - The current context
   * @param highlightedMemberIds - Optional IDs of members to highlight (from @mentions)
   */
  private buildMemberContext(
    members: MemberWithDetails[],
    contextKey: LlmContextKey,
    highlightedMemberIds?: string[],
  ): string {
    if (members.length === 0) return '';

    let context = '';

    // If there are highlighted members, show them first
    if (highlightedMemberIds?.length) {
      const highlighted = members.filter(m => highlightedMemberIds.includes(m.id));
      const others = members.filter(m => !highlightedMemberIds.includes(m.id));

      if (highlighted.length > 0) {
        context += '\n\n=== SPECIFICALLY MENTIONED MEMBERS ===';
        context += this.formatMembers(highlighted, contextKey);
        context += '\n\n=== OTHER TEAM MEMBERS ===';
        context += this.formatMembers(others, contextKey);
      } else {
        context += this.formatMembers(members, contextKey);
      }
    } else {
      context += this.formatMembers(members, contextKey);
    }

    return context;
  }

  /**
   * Format member information based on context
   */
  private formatMembers(members: MemberWithDetails[], contextKey: LlmContextKey): string {
    return members.map(m => this.formatSingleMember(m, contextKey)).join('\n');
  }

  /**
   * Format a single member's information
   */
  private formatSingleMember(m: MemberWithDetails, contextKey: LlmContextKey): string {
    const parts: string[] = [`\n\n--- Member: ${m.firstName} ${m.lastName} ---`];

    this.addBasicMemberInfo(m, parts);
    this.addContextSpecificInfo(m, contextKey, parts);

    if (m.notes) parts.push(`Notes: ${m.notes}`);

    return parts.join('\n');
  }

  /**
   * Add basic member info (department, position, project roles)
   */
  private addBasicMemberInfo(m: MemberWithDetails, parts: string[]): void {
    if (m.department) parts.push(`Department: ${m.department}`);
    if (m.position) parts.push(`Position: ${m.position}`);

    const roles = this.formatProjectRoles(m.projectRoles);
    if (roles) parts.push(`Project Roles: ${roles}`);
  }

  /**
   * Format project roles as comma-separated string
   */
  private formatProjectRoles(projectRoles: MemberWithDetails['projectRoles']): string {
    if (!projectRoles?.length) return '';
    return projectRoles
      .filter(r => r.projectRole?.name)
      .map(r => r.projectRole!.name)
      .join(', ');
  }

  /**
   * Format skills with proficiency levels
   */
  private formatSkillsWithLevels(skills: MemberWithDetails['skills']): string {
    if (!skills?.length) return '';
    return skills
      .filter(s => s.skill?.name)
      .map(s => `${s.skill!.name} (Level ${s.level}/5)`)
      .join(', ');
  }

  /**
   * Add context-specific member information based on detail level
   */
  private addContextSpecificInfo(
    m: MemberWithDetails,
    contextKey: LlmContextKey,
    parts: string[],
  ): void {
    const skillsStr = this.formatSkillsWithLevels(m.skills);
    if (skillsStr) parts.push(`Skills & Proficiency: ${skillsStr}`);

    if (contextKey === 'enhanced' || contextKey === 'advanced') {
      if (m.certification) parts.push(`Certifications: ${m.certification}`);
    }

    if (contextKey === 'advanced') {
      if (m.training) parts.push(`Training: ${m.training}`);
      if (m.education) parts.push(`Education: ${m.education}`);
      if (m.resume) parts.push(`Resume: ${m.resume}`);
      if (m.email) parts.push(`Email: ${m.email}`);
    }
  }

  /**
   * Fetch requests by IDs with full details
   */
  private async fetchRequestsWithDetails(requestIds: string[]): Promise<RequestWithDetails[]> {
    const requests: RequestWithDetails[] = [];

    for (const id of requestIds) {
      try {
        const request = await this.requestsService.findById(id);
        requests.push(request as RequestWithDetails);
      } catch {
        // Skip requests that fail to load
      }
    }

    return requests;
  }

  /**
   * Build context for mentioned requests with matching member recommendations
   */
  private buildRequestContext(
    requests: RequestWithDetails[],
    allMembers: MemberWithDetails[],
  ): string {
    if (requests.length === 0) return '';

    const parts = ['\n\n=== MENTIONED REQUESTS ==='];
    for (const request of requests) {
      parts.push(this.formatSingleRequest(request, allMembers));
    }
    return parts.join('');
  }

  /**
   * Format a single request's context
   */
  private formatSingleRequest(
    request: RequestWithDetails,
    allMembers: MemberWithDetails[],
  ): string {
    const parts: string[] = [
      `\n\n--- Request: ${request.title} ---`,
      `Status: ${request.status}`,
    ];

    this.addRequestBasicInfo(request, parts);
    this.addRequestTimeline(request, parts);
    this.addRequestSkillsAndMatches(request, allMembers, parts);
    this.addRequiredMembers(request, parts);

    return parts.join('\n');
  }

  /**
   * Add basic request info (description, client, project, type)
   */
  private addRequestBasicInfo(request: RequestWithDetails, parts: string[]): void {
    if (request.description) parts.push(`Description: ${request.description}`);
    if (request.clientName) parts.push(`Client: ${request.clientName}`);
    if (request.projectName) parts.push(`Project: ${request.projectName}`);
    if (request.projectType?.name) parts.push(`Project Type: ${request.projectType.name}`);
  }

  /**
   * Add timeline and scheduling info
   */
  private addRequestTimeline(request: RequestWithDetails, parts: string[]): void {
    const totalWeeks = request.executionWeeks + request.preparationWeeks + request.reportingWeeks;
    if (totalWeeks > 0) {
      const breakdown = this.formatTimelineBreakdown(request);
      parts.push(`Timeline: ${totalWeeks} weeks total${breakdown}`);
    }

    if (request.requestedStartDate) {
      parts.push(`Requested Start: ${new Date(request.requestedStartDate).toLocaleDateString()}`);
    }
    if (request.requestedEndDate) {
      parts.push(`Requested End: ${new Date(request.requestedEndDate).toLocaleDateString()}`);
    }
    if (request.requiredMemberCount > 0) {
      parts.push(`Required Team Size: ${request.requiredMemberCount} members`);
    }
    if (request.travelRequired) {
      const location = request.travelLocation ? ` (${request.travelLocation})` : '';
      parts.push(`Travel Required: Yes${location}`);
    }
  }

  /**
   * Format timeline breakdown string
   */
  private formatTimelineBreakdown(request: RequestWithDetails): string {
    const segments: string[] = [];
    if (request.preparationWeeks > 0) segments.push(`${request.preparationWeeks} prep`);
    if (request.executionWeeks > 0) segments.push(`${request.executionWeeks} execution`);
    if (request.reportingWeeks > 0) segments.push(`${request.reportingWeeks} reporting`);
    return segments.length > 0 ? ` (${segments.join(', ')})` : '';
  }

  /**
   * Add required skills and matching member recommendations
   */
  private addRequestSkillsAndMatches(
    request: RequestWithDetails,
    allMembers: MemberWithDetails[],
    parts: string[],
  ): void {
    const requiredSkills = request.requiredSkills
      ?.filter(rs => rs.skill?.name)
      .map(rs => rs.skill!) || [];

    if (requiredSkills.length === 0) return;

    parts.push(`Required Skills: ${requiredSkills.map(s => s.name).join(', ')}`);

    const matchingMembers = this.findMatchingMembers(requiredSkills, allMembers);
    if (matchingMembers.length > 0) {
      parts.push('\n>> RECOMMENDED MEMBERS FOR THIS REQUEST:');
      for (const match of matchingMembers.slice(0, 10)) {
        const skillInfo = `matches ${match.matchingSkills.length}/${requiredSkills.length} skills: ${match.matchingSkills.join(', ')}`;
        const proficiency = `avg proficiency: ${match.avgProficiency.toFixed(1)}/5`;
        parts.push(`  - ${match.member.firstName} ${match.member.lastName} (${skillInfo}) [${proficiency}]`);
      }
    }
  }

  /**
   * Add specifically required members
   */
  private addRequiredMembers(request: RequestWithDetails, parts: string[]): void {
    const requiredMembers = request.requiredMembers
      ?.filter(rm => rm.member)
      .map(rm => rm.member!) || [];

    if (requiredMembers.length === 0) return;

    parts.push('\n>> SPECIFICALLY REQUIRED MEMBERS:');
    for (const member of requiredMembers) {
      parts.push(`  - ${member.firstName} ${member.lastName}`);
    }
  }

  /**
   * Find members that match the required skills, ranked by match quality
   */
  private findMatchingMembers(
    requiredSkills: Array<{ id: string; name: string }>,
    allMembers: MemberWithDetails[],
  ): Array<{
    member: MemberWithDetails;
    matchingSkills: string[];
    avgProficiency: number;
  }> {
    const requiredSkillIds = new Set(requiredSkills.map(s => s.id));
    const matches: Array<{
      member: MemberWithDetails;
      matchingSkills: string[];
      avgProficiency: number;
    }> = [];

    for (const member of allMembers) {
      const memberSkills = member.skills || [];
      const matchingMemberSkills = memberSkills.filter(
        ms => ms.skill && requiredSkillIds.has(ms.skill.name) // Check by name since we have name in required
      );

      // Also check by skill name directly
      const matchingByName = memberSkills.filter(ms => {
        const skillName = ms.skill?.name?.toLowerCase();
        return requiredSkills.some(rs => rs.name.toLowerCase() === skillName);
      });

      const allMatching = matchingByName.length > 0 ? matchingByName : matchingMemberSkills;

      if (allMatching.length > 0) {
        const matchingSkillNames = allMatching
          .map(ms => ms.skill?.name)
          .filter((name): name is string => !!name);

        const avgProficiency =
          allMatching.reduce((sum, ms) => sum + ms.level, 0) / allMatching.length;

        matches.push({
          member,
          matchingSkills: matchingSkillNames,
          avgProficiency,
        });
      }
    }

    // Sort by number of matching skills (desc), then by avg proficiency (desc)
    matches.sort((a, b) => {
      if (b.matchingSkills.length !== a.matchingSkills.length) {
        return b.matchingSkills.length - a.matchingSkills.length;
      }
      return b.avgProficiency - a.avgProficiency;
    });

    return matches;
  }

  // ===========================================
  // Assignment / Schedule context
  // ===========================================

  private static readonly BASELINE_WINDOW_DAYS = 90;
  private static readonly MEMBER_WINDOW_DAYS = 365;
  private static readonly BASELINE_ROW_CAP = 300;
  private static readonly QUOTED_MATCH_CAP_PER_QUOTE = 5;
  private static readonly MIN_QUOTE_LENGTH = 2;

  /**
   * Find the most recent user-role message in the conversation.
   */
  private getLatestUserMessage(messages: ChatMessage[]): ChatMessage | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') return messages[i] ?? null;
    }
    return null;
  }

  /**
   * Extract `"quoted phrases"` from the given message and resolve them to request IDs by
   * matching against `Request.clientName / projectName / title`. Returns the union of
   * resolved IDs and the existing mention list (deduped).
   */
  private async resolveQuotedClientMatches(
    messageContent: string,
    existingRequestIds: string[],
  ): Promise<string[]> {
    const merged = new Set<string>(existingRequestIds);
    if (!messageContent) return [...merged];

    const quotedRegex = /"([^"]+)"/g;
    const quotes = [...messageContent.matchAll(quotedRegex)]
      .map(m => (m[1] ?? '').trim())
      .filter(q => q.length >= LlmChatService.MIN_QUOTE_LENGTH);

    if (quotes.length === 0) return [...merged];

    const lookups = quotes.map(quote =>
      this.prisma.request.findMany({
        where: {
          OR: [
            { clientName: { contains: quote, mode: 'insensitive' as const } },
            { projectName: { contains: quote, mode: 'insensitive' as const } },
            { title: { contains: quote, mode: 'insensitive' as const } },
          ],
        },
        select: { id: true },
        take: LlmChatService.QUOTED_MATCH_CAP_PER_QUOTE,
      }),
    );

    const results = await Promise.all(lookups);
    for (const matches of results) {
      for (const match of matches) merged.add(match.id);
    }

    return [...merged];
  }

  /**
   * Fetch the canonical project-type list (active only) for the LLM to disambiguate
   * natural-language references like "FTO" or "vacation".
   */
  private async fetchProjectTypes() {
    return this.projectTypesService.findActive();
  }

  /**
   * Baseline window of assignments (no member filter), role-aware. Defaults to ±90 days
   * from now; an explicit `overrideRange` (typically extracted from the user's message)
   * replaces it.
   */
  private async fetchBaselineAssignments(userRole?: Role, overrideRange?: DateRange | null) {
    const range = overrideRange ?? this.computeWindow(LlmChatService.BASELINE_WINDOW_DAYS);
    const result = await this.assignmentsService.getCalendarView(
      {
        startDate: range.startDate,
        endDate: range.endDate,
      },
      userRole,
    );
    return { ...result, startDate: range.startDate, endDate: range.endDate, label: range.label };
  }

  /**
   * Window of assignments scoped to the mentioned members, role-aware. Defaults to ±12
   * months from now; an explicit `overrideRange` (typically extracted from the user's
   * message) replaces it.
   */
  private async fetchMemberScopedAssignments(
    memberIds: string[],
    userRole?: Role,
    overrideRange?: DateRange | null,
  ) {
    if (memberIds.length === 0) return null;
    const range = overrideRange ?? this.computeWindow(LlmChatService.MEMBER_WINDOW_DAYS);
    const result = await this.assignmentsService.getCalendarView(
      {
        startDate: range.startDate,
        endDate: range.endDate,
        memberIds,
      },
      userRole,
    );
    return { ...result, startDate: range.startDate, endDate: range.endDate, label: range.label };
  }

  /**
   * All assignments linked to the given request IDs (mentioned + client-name-resolved).
   */
  private async fetchRequestScopedAssignments(requestIds: string[]) {
    if (requestIds.length === 0) return [];

    return this.prisma.assignment.findMany({
      where: { requestId: { in: requestIds } },
      include: {
        projectType: true,
        request: {
          select: { id: true, title: true, clientName: true, projectName: true, status: true },
        },
        members: {
          include: {
            member: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  /**
   * Compute a [now - days, now + days] ISO date range string pair.
   */
  private computeWindow(days: number): DateRange {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    const end = new Date(now);
    end.setDate(end.getDate() + days);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }

  private static readonly MONTH_NAMES: ReadonlyArray<string> = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];

  /**
   * Parse the user message for date references and return a corresponding range.
   * Supports (in order of precedence):
   *  - explicit ranges:  "2024..2026", "from 2024 to 2026", "between 2024 and 2026"
   *  - quarters:         "Q3 2024"
   *  - YYYY-MM:          "2024-03"
   *  - month names:      "March 2024" (year optional — defaults to current year)
   *  - bare year:        "2024"
   *  - relative:         "last|this|next|previous|prior|current year|quarter|month"
   * Returns null if no recognizable reference is found.
   */
  private extractDateRange(content: string, now: Date): DateRange | null {
    if (!content) return null;

    // 1. Explicit year range — covers `2024..2026`, `from 2024 to 2026`, `between 2024 and 2026`,
    //    `2024 - 2026`, `2024 through 2026`.
    const rangeMatch =
      /\bbetween\s+(20\d{2})\s+and\s+(20\d{2})\b/i.exec(content) ??
      /\bfrom\s+(20\d{2})\s+to\s+(20\d{2})\b/i.exec(content) ??
      /\b(20\d{2})\s*(?:\.\.|through|thru|–|—|-|to)\s*(20\d{2})\b/i.exec(content);
    if (rangeMatch) {
      const a = parseInt(rangeMatch[1] ?? '', 10);
      const b = parseInt(rangeMatch[2] ?? '', 10);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return this.buildRange(
          new Date(lo, 0, 1),
          new Date(hi, 11, 31, 23, 59, 59, 999),
          `${lo}–${hi}`,
        );
      }
    }

    // 2. Quarter: "Q3 2024"
    const qMatch = /\bQ([1-4])\s+(20\d{2})\b/i.exec(content);
    if (qMatch) {
      const q = parseInt(qMatch[1] ?? '', 10);
      const year = parseInt(qMatch[2] ?? '', 10);
      if (Number.isFinite(q) && Number.isFinite(year)) {
        const startMonth = (q - 1) * 3;
        return this.buildRange(
          new Date(year, startMonth, 1),
          new Date(year, startMonth + 3, 0, 23, 59, 59, 999),
          `Q${q} ${year}`,
        );
      }
    }

    // 3. YYYY-MM
    const ymMatch = /\b(20\d{2})-(0[1-9]|1[0-2])\b/.exec(content);
    if (ymMatch) {
      const year = parseInt(ymMatch[1] ?? '', 10);
      const month = parseInt(ymMatch[2] ?? '', 10);
      if (Number.isFinite(year) && Number.isFinite(month)) {
        return this.buildRange(
          new Date(year, month - 1, 1),
          new Date(year, month, 0, 23, 59, 59, 999),
          `${ymMatch[1]}-${ymMatch[2]}`,
        );
      }
    }

    // 4. Month name (with optional 4-digit year)
    const mnMatch = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+(20\d{2}))?/i.exec(content);
    if (mnMatch) {
      const monthIdx = LlmChatService.MONTH_NAMES.indexOf((mnMatch[1] ?? '').toLowerCase());
      const year = mnMatch[2] ? parseInt(mnMatch[2], 10) : now.getFullYear();
      if (monthIdx >= 0 && Number.isFinite(year)) {
        const monthName = LlmChatService.MONTH_NAMES[monthIdx]!;
        return this.buildRange(
          new Date(year, monthIdx, 1),
          new Date(year, monthIdx + 1, 0, 23, 59, 59, 999),
          `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`,
        );
      }
    }

    // 5. Bare 4-digit year
    const yearMatch = /\b(20\d{2})\b/.exec(content);
    if (yearMatch) {
      const year = parseInt(yearMatch[1] ?? '', 10);
      if (Number.isFinite(year)) {
        return this.buildRange(
          new Date(year, 0, 1),
          new Date(year, 11, 31, 23, 59, 59, 999),
          `${year}`,
        );
      }
    }

    // 6. Relative phrases: "last/previous/prior|this/current|next year|quarter|month"
    const relMatch = /\b(last|previous|prior|this|current|next)\s+(year|quarter|month)\b/i.exec(content);
    if (relMatch) {
      return this.computeRelativeRange(
        (relMatch[1] ?? '').toLowerCase(),
        (relMatch[2] ?? '').toLowerCase(),
        now,
      );
    }

    return null;
  }

  private buildRange(start: Date, end: Date, label: string): DateRange {
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      label,
    };
  }

  private computeRelativeRange(
    direction: string,
    unit: string,
    now: Date,
  ): DateRange {
    const offset = direction === 'last' || direction === 'previous' || direction === 'prior'
      ? -1
      : direction === 'next'
        ? 1
        : 0;

    if (unit === 'year') {
      const year = now.getFullYear() + offset;
      return this.buildRange(
        new Date(year, 0, 1),
        new Date(year, 11, 31, 23, 59, 59, 999),
        `${direction} year (${year})`,
      );
    }

    if (unit === 'month') {
      const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      return this.buildRange(
        target,
        new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59, 999),
        `${direction} month`,
      );
    }

    // unit === 'quarter'
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const targetQuarterIndex = currentQuarter + offset;
    const targetYear = now.getFullYear() + Math.floor(targetQuarterIndex / 4);
    const targetQuarter = ((targetQuarterIndex % 4) + 4) % 4;
    const startMonth = targetQuarter * 3;
    return this.buildRange(
      new Date(targetYear, startMonth, 1),
      new Date(targetYear, startMonth + 3, 0, 23, 59, 59, 999),
      `${direction} quarter (Q${targetQuarter + 1} ${targetYear})`,
    );
  }

  /**
   * Round a date span to whole weeks (minimum 1).
   */
  private formatWeeks(startDate: Date | string, endDate: Date | string): number {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const days = Math.max(0, (end - start) / 86_400_000);
    return Math.max(1, Math.round(days / 7));
  }

  /** Format YYYY-MM-DD from a Date or ISO string. */
  private toDate(value: Date | string): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  /**
   * Build the project-type list context section.
   */
  private buildProjectTypeContext(
    projectTypes: Array<{ id: string; name: string; abbreviation?: string | null; description?: string | null }>,
  ): string {
    if (projectTypes.length === 0) return '';
    const lines = ['\n\n=== PROJECT TYPES ==='];
    for (const pt of projectTypes) {
      const abbr = pt.abbreviation ? ` [${pt.abbreviation}]` : '';
      const desc = pt.description ? `: ${pt.description}` : '';
      lines.push(`- ${pt.name}${abbr}${desc}`);
    }
    return lines.join('\n');
  }

  /**
   * Build the rolling baseline assignment summary (capped).
   */
  private buildBaselineAssignmentContext(
    data: { assignments: AssignmentRow[]; startDate: string; endDate: string; label?: string } | null,
  ): string {
    if (!data || data.assignments.length === 0) return '';

    const start = this.toDate(data.startDate);
    const end = this.toDate(data.endDate);
    const labelSuffix = data.label ? ` — matched "${data.label}" from user message` : '';
    const lines = [`\n\n=== ASSIGNMENTS — UPCOMING WINDOW (${start} to ${end}${labelSuffix}) ===`];
    lines.push('Format: Member(s) | Type | Title | Start–End (weeks) | Client | Status');

    const rows = data.assignments.slice(0, LlmChatService.BASELINE_ROW_CAP);
    for (const a of rows) {
      lines.push(this.formatAssignmentRow(a));
    }

    if (data.assignments.length > LlmChatService.BASELINE_ROW_CAP) {
      const truncated = data.assignments.length - LlmChatService.BASELINE_ROW_CAP;
      lines.push(`(+${truncated} more truncated — narrow your query with @member or a "Client" string for full detail)`);
    }

    return lines.join('\n');
  }

  /**
   * Build the per-mentioned-member assignment context.
   */
  private buildMemberAssignmentContext(
    data: { assignments: AssignmentRow[]; startDate: string; endDate: string; label?: string } | null,
  ): string {
    if (!data || data.assignments.length === 0) return '';

    const start = this.toDate(data.startDate);
    const end = this.toDate(data.endDate);
    const labelSuffix = data.label ? ` — matched "${data.label}" from user message` : '';
    const lines = [`\n\n=== ASSIGNMENTS — MENTIONED MEMBERS (${start} to ${end}${labelSuffix}) ===`];

    const byMember = new Map<string, { name: string; rows: AssignmentRow[] }>();
    for (const a of data.assignments) {
      for (const am of a.members ?? []) {
        if (!am.member) continue;
        const key = am.member.id;
        const name = `${am.member.firstName} ${am.member.lastName}`;
        if (!byMember.has(key)) byMember.set(key, { name, rows: [] });
        byMember.get(key)!.rows.push(a);
      }
    }

    for (const { name, rows } of byMember.values()) {
      lines.push(`\n--- ${name} ---`);
      for (const a of rows) {
        lines.push(this.formatAssignmentRow(a, { omitMember: true }));
      }
    }

    return lines.join('\n');
  }

  /**
   * Build the per-mentioned-request roster context (members staffed to client/request).
   */
  private buildRequestAssignmentContext(assignments: AssignmentRow[]): string {
    if (assignments.length === 0) return '';

    const byRequest = new Map<string, { request: RequestSummary; rows: AssignmentRow[] }>();
    for (const a of assignments) {
      if (!a.request) continue;
      const key = a.request.id;
      if (!byRequest.has(key)) byRequest.set(key, { request: a.request, rows: [] });
      byRequest.get(key)!.rows.push(a);
    }

    if (byRequest.size === 0) return '';

    const lines = ['\n\n=== ASSIGNMENTS — MENTIONED / RESOLVED REQUESTS ==='];
    for (const { request, rows } of byRequest.values()) {
      const clientLabel = request.clientName ? ` (${request.clientName})` : '';
      lines.push(`\n--- Request: ${request.title}${clientLabel} ---`);

      const memberSet = new Map<string, string>();
      let minStart = Infinity;
      let maxEnd = -Infinity;
      const projectTypeSet = new Set<string>();

      for (const a of rows) {
        const start = new Date(a.startDate).getTime();
        const end = new Date(a.endDate).getTime();
        if (start < minStart) minStart = start;
        if (end > maxEnd) maxEnd = end;
        if (a.projectType?.name) projectTypeSet.add(a.projectType.name);
        for (const am of a.members ?? []) {
          if (am.member) {
            memberSet.set(am.member.id, `${am.member.firstName} ${am.member.lastName}`);
          }
        }
      }

      const memberNames = [...memberSet.values()].join(', ') || '(none assigned yet)';
      lines.push(`Members staffed: ${memberNames}`);
      if (Number.isFinite(minStart) && Number.isFinite(maxEnd)) {
        lines.push(`Date range: ${this.toDate(new Date(minStart))} to ${this.toDate(new Date(maxEnd))}`);
      }
      if (projectTypeSet.size > 0) {
        lines.push(`Project Type(s): ${[...projectTypeSet].join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a single assignment as a one-line row.
   */
  private formatAssignmentRow(a: AssignmentRow, opts: { omitMember?: boolean } = {}): string {
    const memberPart = opts.omitMember
      ? null
      : (a.members ?? [])
          .map(am => am.member ? `${am.member.firstName} ${am.member.lastName}` : null)
          .filter((n): n is string => !!n)
          .join(', ') || '(unassigned)';

    const type = a.projectType?.name ?? '?';
    const title = a.title ?? '';
    const start = this.toDate(a.startDate);
    const end = this.toDate(a.endDate);
    const weeks = this.formatWeeks(a.startDate, a.endDate);
    const client = a.request?.clientName ?? '-';
    const status = a.displayStatus ?? '?';

    const segments = [
      memberPart,
      type,
      title,
      `${start}–${end} (${weeks}w)`,
      client,
      status,
    ].filter((s): s is string => s !== null);

    return `- ${segments.join(' | ')}`;
  }
}

interface AssignmentRow {
  title: string;
  startDate: Date | string;
  endDate: Date | string;
  displayStatus: string;
  projectType?: { name: string } | null;
  request?: RequestSummary | null;
  members?: Array<{
    member?: {
      id: string;
      firstName: string;
      lastName: string;
    } | null;
  }> | null;
}

interface RequestSummary {
  id: string;
  title?: string;
  clientName?: string | null;
  projectName?: string | null;
  status?: string;
}

interface DateRange {
  startDate: string;
  endDate: string;
  /** Human-friendly label for the matched range (e.g. "2026", "Q3 2024", "last quarter (Q1 2026)"). */
  label?: string;
}
