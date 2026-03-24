import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MembersService } from '../members/members.service';
import { RequestsService } from '../requests/requests.service';
import { UserSettingsService } from '../user-settings/user-settings.service';
import {
  buildLlmSystemPrompt,
  getContextFromPathname,
  LlmContextKey,
  LLM_QUIP_PARSER_SYSTEM_PROMPT,
  LLM_RESUME_PARSER_SYSTEM_PROMPT,
  ParsedResumeFields,
  QuipParsedRequestFields,
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

  constructor(
    private readonly httpService: HttpService,
    private readonly userSettingsService: UserSettingsService,
    private readonly membersService: MembersService,
    private readonly requestsService: RequestsService,
  ) {}

  async chat(
    userId: string,
    messages: ChatMessage[],
    pageContext?: PageContext,
    contextOverride?: LlmContextKey,
    mentionedMemberIds?: string[],
    mentionedRequestIds?: string[],
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

    // Fetch mentioned requests if any
    const mentionedRequests = mentionedRequestIds?.length
      ? await this.fetchRequestsWithDetails(mentionedRequestIds)
      : [];

    // Build request context with matching members
    const requestContext = this.buildRequestContext(mentionedRequests, allMembers);

    // Build member context - highlight mentioned members if any
    const memberContext = this.buildMemberContext(
      allMembers,
      contextKey,
      mentionedMemberIds,
    );

    // Combine request and member context
    const fullContext = requestContext + memberContext;

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

    // Disable TLS verification for self-signed certificates
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
          },
        ),
      );

      return response.data.choices[0]?.message?.content || '';
    } catch (error: unknown) {
      throw this.handleLlmApiError(error, baseUrl, 'chat');
    } finally {
      this.restoreTlsSetting(originalRejectUnauthorized);
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

    const originalRejectUnauthorized =
      process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
          },
        ),
      );

      const responseText =
        response.data.choices[0]?.message?.content || '{}';

      return this.parseJsonResponse<QuipParsedRequestFields>(responseText, 'document');
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      throw this.handleLlmApiError(error, baseUrl, 'document parsing');
    } finally {
      this.restoreTlsSetting(originalRejectUnauthorized);
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

    const originalRejectUnauthorized =
      process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
          },
        ),
      );

      const responseText =
        response.data.choices[0]?.message?.content || '{}';

      this.logger.log('LLM resume parser response:', responseText);

      return this.parseJsonResponse<ParsedResumeFields>(responseText, 'resume');
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      throw this.handleLlmApiError(error, baseUrl, 'resume parsing');
    } finally {
      this.restoreTlsSetting(originalRejectUnauthorized);
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

  /**
   * Restore TLS setting after API call
   */
  private restoreTlsSetting(originalValue: string | undefined): void {
    if (originalValue === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalValue;
    }
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

    if (request.notes) parts.push(`Notes: ${request.notes}`);

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
}
