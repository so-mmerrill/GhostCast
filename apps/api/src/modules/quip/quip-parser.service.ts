import { Injectable, Logger } from '@nestjs/common';
import { QuipParsedRequestFields } from '@ghostcast/shared';
import { PrismaService } from '../../database/prisma.service';
import { ProjectTypesService } from '../project-types/project-types.service';
import { SkillsService } from '../skills/skills.service';

/**
 * Raw extracted data from the 4-column questionnaire format.
 * Columns: Question | Answer | Notes | Assumptions
 */
interface QuipRawData {
  questions: Record<string, string>;
  answers: Record<string, string>;
  notes: Record<string, string>;
  assumptions: Record<string, string>;
  /** Raw HTML content for each cell (for preserving original formatting) */
  rawHtmlCells: Record<string, { answer: string; notes: string; assumptions: string }>;
}

/**
 * Parses QUIP document HTML into structured request fields.
 *
 * Supports three extraction strategies:
 *   1. Table rows: <tr><td>Field Name</td><td>Value</td></tr>
 *   2. Bold labels: <b>Field Name:</b> Value
 *   3. Heading + content: <h2>Field Name</h2><p>Value</p>
 *
 * Enhanced support for 4-column questionnaire format:
 *   Question | Answer | Notes | Assumptions
 */
@Injectable()
export class QuipParserService {
  private readonly logger = new Logger(QuipParserService.name);

  private readonly defaultProjectType = 'Offensive Services - Misc';

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectTypesService: ProjectTypesService,
    private readonly skillsService: SkillsService,
  ) {}

  private readonly fieldAliases: Record<
    string,
    keyof QuipParsedRequestFields
  > = {
    'project name': 'projectName',
    project: 'projectName',
    title: 'title',
    client: 'clientName',
    'client name': 'clientName',
    description: 'description',
    'project id': 'projectId',
    'start date': 'requestedStartDate',
    'requested start date': 'requestedStartDate',
    'end date': 'requestedEndDate',
    'requested end date': 'requestedEndDate',
    timezone: 'timezone',
    'time zone': 'timezone',
    url: 'urlLink',
    'url link': 'urlLink',
    link: 'urlLink',
    'preparation weeks': 'preparationWeeks',
    'prep weeks': 'preparationWeeks',
    'execution weeks': 'executionWeeks',
    'reporting weeks': 'reportingWeeks',
    'student count': 'studentCount',
    students: 'studentCount',
    format: 'format',
    location: 'location',
    'travel location': 'travelLocation',
    'required members': 'requiredMemberCount',
    'member count': 'requiredMemberCount',
    'testing type': 'projectTypeName',
    deliverable: 'format',
    deliverables: 'format',
    pocs: 'clientName', // Extract client from POC email
  };

  async parse(
    html: string,
    documentTitle?: string,
  ): Promise<QuipParsedRequestFields> {
    const result: QuipParsedRequestFields = {};

    // Filter HTML to start from "Consulting Worksheet" marker if present
    const { filteredHtml, markerFound } = this.filterToOffensiveScoping(html);

    // Parse client name from document title if provided
    if (documentTitle) {
      result.clientName = this.parseClientFromTitle(documentTitle);
    }

    // Extract content from table if present
    await this.extractFromTableContent(filteredHtml, result);

    // Supplementary strategies for non-table content
    this.extractFromBoldLabels(filteredHtml, result);
    this.extractFromHeadings(filteredHtml, result);

    // Apply default values and fallbacks
    this.applyDefaults(result, html);

    // Coerce numeric fields
    this.coerceNumericFields(result);

    // Match project type from database
    result.projectTypeName = await this.matchProjectType(result.projectTypeName);

    // Extract level of effort from entire filtered text (search for #p/#w pattern)
    if (result.executionWeeks === undefined) {
      const textContent = this.htmlToText(filteredHtml);
      const loeMatch = /(\d+)\s*(?:p(?:eople)?)\s*[/\\]\s*(\d+)\s*(?:w(?:eeks?)?)/i.exec(textContent);
      if (loeMatch) {
        result.executionWeeks = Number.parseInt(loeMatch[2]!, 10);
        result.requiredMemberCount ??= Number.parseInt(loeMatch[1]!, 10);
        // Calculate end date immediately after execution weeks are identified
        if (result.requestedStartDate && !result.requestedEndDate) {
          result.requestedEndDate = this.calculateEndDate(
            result.requestedStartDate,
            result.executionWeeks,
          );
        }
      }
    }

    // Set description to the parsed data from the Consulting Worksheet table
    // Only include content if the marker was found
    result.description = markerFound
      ? this.formatDescription(this.htmlToText(filteredHtml))
      : '';

    // Include filtered raw HTML for preview (starting from Offensive Scoping table)
    result.rawHtml = filteredHtml;

    const extractedKeys = Object.keys(result).filter((k) => k !== 'rawHtml');
    this.logger.debug(
      `Parsed QUIP document, extracted fields: ${extractedKeys.join(', ')}`,
    );

    return result;
  }

  /**
   * Extract content from table if present in HTML.
   */
  private async extractFromTableContent(
    html: string,
    result: QuipParsedRequestFields,
  ): Promise<void> {
    if (!/<table[\s>]/i.test(html)) {
      return;
    }

    // Try 4-column questionnaire format first
    const rawData = this.extractRawData(html);

    if (this.hasQuestionnaireData(rawData)) {
      await this.processQuestionnaireData(rawData, result);
      return;
    }

    // Fall back to CSV-based extraction
    const csv = this.tableToCsv(html);
    this.extractFromCsv(csv, result);
    result.description ??= csv;
  }

  /**
   * Apply default values and fallbacks after extraction.
   */
  private applyDefaults(
    result: QuipParsedRequestFields,
    originalHtml: string,
  ): void {
    // Fallback description for non-table documents
    result.description ??= this.htmlToText(originalHtml);

    // Set project name to client name if not already set
    result.projectName ??= result.clientName;

    // If title was not found, use the first line of text
    this.setProjectNameFromDescription(result);
  }

  /**
   * Set project name from first line of description if not already set.
   */
  private setProjectNameFromDescription(result: QuipParsedRequestFields): void {
    if (result.title || result.projectName || !result.description) {
      return;
    }
    const firstLine = result.description
      .split('\n')
      .find((l) => l.trim().length > 0);
    if (firstLine) {
      result.projectName = firstLine.trim().substring(0, 200);
    }
  }

  /**
   * Match extracted project type against available project types in the database.
   * Uses case-insensitive partial matching.
   * Returns the matched project type name or defaults to 'Offensive Services - Misc'.
   */
  private async matchProjectType(
    extractedType: string | undefined,
  ): Promise<string> {
    const projectTypes = await this.prisma.projectType.findMany({
      where: { isActive: true },
      select: { name: true, abbreviation: true },
    });

    if (!extractedType) {
      return this.defaultProjectType;
    }

    const normalizedExtracted = extractedType.toLowerCase().trim();
    const extractedWords = normalizedExtracted.split(/\s+/);

    // Try exact match first (case-insensitive)
    const exactMatch = projectTypes.find(
      (pt) => pt.name.toLowerCase() === normalizedExtracted,
    );
    if (exactMatch) {
      return exactMatch.name;
    }

    // Try abbreviation match (case-insensitive)
    const abbrevMatch = projectTypes.find(
      (pt) => pt.abbreviation?.toLowerCase() === normalizedExtracted,
    );
    if (abbrevMatch) {
      return abbrevMatch.name;
    }

    // Try partial match: project type name contains extracted text
    const containsMatch = projectTypes.find((pt) =>
      pt.name.toLowerCase().includes(normalizedExtracted),
    );
    if (containsMatch) {
      return containsMatch.name;
    }

    // Try matching the suffix part of project type name (after " - ")
    const suffixMatch = projectTypes.find((pt) => {
      const suffix = pt.name.toLowerCase().split(' - ').pop() ?? '';
      return (
        suffix.includes(normalizedExtracted) ||
        normalizedExtracted.includes(suffix)
      );
    });
    if (suffixMatch) {
      return suffixMatch.name;
    }

    // Try word-based matching: any extracted word matches part of project type
    const wordMatch = projectTypes.find((pt) => {
      const ptLower = pt.name.toLowerCase();
      return extractedWords.some(
        (word) => word.length > 2 && ptLower.includes(word),
      );
    });
    if (wordMatch) {
      return wordMatch.name;
    }

    // Default to Offensive Services - Misc
    return this.defaultProjectType;
  }

  /**
   * Filter HTML to find the "Consulting Worksheet" table.
   * Looks for table with title='Consulting Worksheet' attribute.
   * Cuts all data before the table tag and only parses data after.
   * Returns HTML starting from the Consulting Worksheet table and whether the marker was found.
   */
  private filterToOffensiveScoping(html: string): {
    filteredHtml: string;
    markerFound: boolean;
  } {
    // Find table with title='Consulting Worksheet' attribute
    const titleAttrRegex =
      /<table[^>]*title\s*=\s*['"]Consulting Worksheet['"][^>]*>/i;
    const titleMatch = titleAttrRegex.exec(html);
    if (titleMatch) {
      return { filteredHtml: html.slice(titleMatch.index), markerFound: true };
    }

    // No Consulting Worksheet table found, return original HTML
    return { filteredHtml: html, markerFound: false };
  }

  /**
   * Find the questionnaire table by looking for column headers and question keywords.
   * Returns the index of the best matching table, or -1 if not found.
   */
  /**
   * Extract raw data from questionnaire format.
   * Only processes the FIRST table found in the HTML.
   * Supports two formats:
   *   4-column: Question | Answer | Notes | Assumptions
   *   5-column: # | Question | Answer | Notes | Assumptions (with row numbers)
   */
  private extractRawData(html: string): QuipRawData {
    const rawData: QuipRawData = {
      questions: {},
      answers: {},
      notes: {},
      assumptions: {},
      rawHtmlCells: {},
    };

    const tableMatch = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(html);
    if (!tableMatch) {
      return rawData;
    }

    const rows = this.extractTableRows(tableMatch[0]);
    if (rows.length === 0) {
      return rawData;
    }

    const columnOffset = this.detectColumnOffset(rows[0]!);

    for (let i = 1; i < rows.length; i++) {
      this.processTableRow(rows[i]!, columnOffset, rawData);
    }

    return rawData;
  }

  /**
   * Extract all rows from a table as arrays of cells and raw HTML.
   */
  private extractTableRows(
    tableHtml: string,
  ): Array<{ cells: string[]; rawCells: string[] }> {
    const rows: Array<{ cells: string[]; rawCells: string[] }> = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const cells: string[] = [];
      const rawCells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      cellRegex.lastIndex = 0;

      while ((cellMatch = cellRegex.exec(rowMatch[1]!)) !== null) {
        const rawContent = cellMatch[1]!;
        rawCells.push(rawContent);
        cells.push(this.stripZws(this.stripHtml(rawContent)));
      }

      rows.push({ cells, rawCells });
    }

    return rows;
  }

  /**
   * Detect if the table has a row number column and return the offset.
   * Returns 1 if first column is row numbers, 0 otherwise.
   */
  private detectColumnOffset(headerRow: {
    cells: string[];
    rawCells: string[];
  }): number {
    const { cells } = headerRow;
    // Check if second column is "Question" or first column is numeric/empty
    if (
      cells[1]?.toLowerCase() === 'question' ||
      /^\d*$/.test(cells[0]?.trim() ?? '')
    ) {
      return 1;
    }
    return 0;
  }

  /**
   * Process a single table row and add it to the raw data.
   */
  private processTableRow(
    row: { cells: string[]; rawCells: string[] },
    columnOffset: number,
    rawData: QuipRawData,
  ): void {
    const { cells, rawCells } = row;

    // Skip header rows
    if (cells[columnOffset]?.toLowerCase() === 'question') {
      return;
    }

    if (cells.length < columnOffset + 2) {
      return;
    }

    const question = cells[columnOffset]?.trim() ?? '';
    if (!question) {
      return;
    }

    rawData.questions[question] = question;
    rawData.answers[question] = cells[columnOffset + 1]?.trim() ?? '';
    rawData.notes[question] = cells[columnOffset + 2]?.trim() ?? '';
    rawData.assumptions[question] = cells[columnOffset + 3]?.trim() ?? '';
    rawData.rawHtmlCells[question] = {
      answer: rawCells[columnOffset + 1] ?? '',
      notes: rawCells[columnOffset + 2] ?? '',
      assumptions: rawCells[columnOffset + 3] ?? '',
    };
  }

  /**
   * Check if the raw data has meaningful questionnaire content.
   */
  private hasQuestionnaireData(rawData: QuipRawData): boolean {
    return Object.keys(rawData.questions).length > 0;
  }

  /**
   * Process questionnaire data into parsed fields.
   */
  private async processQuestionnaireData(
    rawData: QuipRawData,
    result: QuipParsedRequestFields,
  ): Promise<void> {
    // Process each field for extraction
    for (const question of Object.keys(rawData.questions)) {
      await this.processQuestionnaireField(question, rawData, result);
    }

    // Build summary description from key fields
    result.description = this.buildSummaryDescription(rawData);
    this.applyQuestionnaireDefaults(result);
  }

  /**
   * Build description from questionnaire answers.
   * Only includes data from after the Offensive Scoping marker.
   */
  private buildSummaryDescription(rawData: QuipRawData): string {
    const parts: string[] = [];

    for (const question of Object.keys(rawData.questions)) {
      const answer = rawData.answers[question] ?? '';

      // Skip blank answers
      if (this.isBlankValue(answer)) {
        continue;
      }

      const content = this.htmlToText(answer);
      if (content && content.length > 0) {
        parts.push(content);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Process a single questionnaire field.
   */
  private async processQuestionnaireField(
    question: string,
    rawData: QuipRawData,
    result: QuipParsedRequestFields,
  ): Promise<void> {
    const answer = rawData.answers[question] ?? '';
    const note = rawData.notes[question] ?? '';
    const label = question.toLowerCase();

    this.logger.debug(
      `Processing questionnaire field - label: "${label}", answer: "${answer}", note: "${note}"`,
    );

    // Handle special fields
    if (await this.processSpecialField(label, answer, note, result)) {
      return;
    }

    // Handle technologies separately (async)
    if (label === 'technologies' || label === 'technology') {
      await this.processTechnologiesField(answer, note, result);
      return;
    }

    // Standard field assignment
    this.processStandardField(label, answer, note, result);
  }

  /**
   * Process special fields that need custom handling.
   * Returns true if the field was handled.
   */
  private async processSpecialField(
    label: string,
    answer: string,
    note: string,
    result: QuipParsedRequestFields,
  ): Promise<boolean> {
    if (label === 'level of effort') {
      this.parseEnhancedLevelOfEffort(answer, note, result);
      return true;
    }

    if (label === 'pocs' || label === 'poc') {
      this.processPocField(answer, note, result);
      return true;
    }

    if (label === 'testing type') {
      this.logger.debug(
        `Found testing type field - answer: "${answer}", note: "${note}"`,
      );
      await this.processTestingTypeField(answer, note, result);
      return true;
    }

    return false;
  }

  /**
   * Process testing type field to match project type from database.
   * Searches both answer and notes columns using partial search via the
   * ProjectTypesService API. This handles cases where specific type info
   * (e.g., "Purple Team") is in notes while answer contains generic values
   * like "Misc."
   */
  private async processTestingTypeField(
    answer: string,
    note: string,
    result: QuipParsedRequestFields,
  ): Promise<void> {
    this.logger.debug(
      `Processing testing type - answer: "${answer}", note: "${note}"`,
    );

    if (!answer && !note) {
      return;
    }

    // Try matching note first (often contains specific type like "Purple Team")
    if (note) {
      const noteMatch = await this.searchProjectType(note);
      this.logger.debug(`Note search for "${note}" returned: ${noteMatch}`);
      if (noteMatch) {
        result.projectTypeName = noteMatch;
        return;
      }
    }

    // Fall back to answer column
    if (answer) {
      const answerMatch = await this.searchProjectType(answer);
      this.logger.debug(`Answer search for "${answer}" returned: ${answerMatch}`);
      if (answerMatch) {
        result.projectTypeName = answerMatch;
        return;
      }
    }

    // Default if no match found
    result.projectTypeName = this.defaultProjectType;
  }

  /**
   * Search for a project type using partial matching via ProjectTypesService.
   * Returns the first matching project type name, or null if no match found.
   */
  private async searchProjectType(search: string): Promise<string | null> {
    this.logger.debug(`Searching project types with query: "${search}"`);

    const response = await this.projectTypesService.findAll({
      page: 1,
      pageSize: 1,
      search,
    });

    this.logger.debug(
      `Project type search results: ${JSON.stringify(response.data)}`,
    );

    if (response.data.length > 0) {
      return response.data[0]!.name;
    }

    return null;
  }

  /**
   * Process POC field to extract client name from email.
   */
  private processPocField(
    answer: string,
    note: string,
    result: QuipParsedRequestFields,
  ): void {
    if (result.clientName || (!answer && !note)) {
      return;
    }
    const clientName = this.extractClientFromEmail(answer || note);
    if (clientName) {
      result.clientName = clientName;
    }
  }

  /**
   * Process technologies field to create skill bubbles.
   * Searches for each technology in the database using SkillsService.
   * If found, uses the matched skill name; otherwise adds the original
   * technology name as a bubble.
   */
  private async processTechnologiesField(
    answer: string,
    note: string,
    result: QuipParsedRequestFields,
  ): Promise<void> {
    // Combine answer and note columns
    const techText = [answer, note].filter(Boolean).join(', ');
    if (!techText) {
      return;
    }

    // Parse individual technologies (split by common delimiters)
    const technologies = techText
      .split(/[,;|/\n]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    this.logger.debug(`Parsing technologies: ${JSON.stringify(technologies)}`);

    const skillNames: string[] = [];

    for (const tech of technologies) {
      const matchedSkill = await this.searchSkill(tech);
      // Use matched skill name from database, or original technology name as-is
      const skillName = matchedSkill ?? tech;
      if (!skillNames.includes(skillName)) {
        skillNames.push(skillName);
      }
    }

    this.logger.debug(`Resolved skill names: ${JSON.stringify(skillNames)}`);

    if (skillNames.length > 0) {
      result.skillNames = skillNames;
    }
  }

  /**
   * Search for a skill using partial matching via SkillsService.
   * Returns the first matching skill name, or null if no match found.
   */
  private async searchSkill(search: string): Promise<string | null> {
    this.logger.debug(`Searching skills with query: "${search}"`);

    const response = await this.skillsService.findAll({
      page: 1,
      pageSize: 1,
      search,
    });

    if (response.data.length > 0) {
      this.logger.debug(`Skill search for "${search}" found: ${response.data[0]!.name}`);
      return response.data[0]!.name;
    }

    this.logger.debug(`Skill search for "${search}" found no match`);
    return null;
  }

  /**
   * Process standard questionnaire field.
   */
  private processStandardField(
    label: string,
    answer: string,
    note: string,
    result: QuipParsedRequestFields,
  ): void {
    const isBlankAnswer = this.isBlankValue(answer);

    if (!isBlankAnswer) {
      this.assignField(label, answer, result);
    } else if (note) {
      this.assignField(label, note, result);
    }
  }

  /**
   * Check if a value is considered blank.
   */
  private isBlankValue(value: string): boolean {
    return !value || value.toLowerCase() === 'none' || value === '0';
  }

  /**
   * Apply default values after questionnaire processing.
   */
  private applyQuestionnaireDefaults(result: QuipParsedRequestFields): void {
    // Start date defaults to 90 days from today
    result.requestedStartDate ??= this.calculateStartDate(90);

    // Calculate end date based on start date and execution weeks
    if (!result.requestedEndDate && result.requestedStartDate && result.executionWeeks) {
      result.requestedEndDate = this.calculateEndDate(
        result.requestedStartDate,
        result.executionWeeks,
      );
    }

    // Default required member count to 2
    result.requiredMemberCount ??= 2;
  }

  /**
   * Calculate a start date X days from today, adjusted to the nearest Monday.
   * Returns date in YYYY-MM-DD format.
   */
  private calculateStartDate(daysFromToday: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromToday);

    // Adjust to nearest Monday
    const dayOfWeek = date.getDay();
    // Days to add/subtract to reach Monday: Sun(0)->+1, Mon(1)->0, Tue(2)->-1, Wed(3)->-2, Thu(4)->-3, Fri(5)->+3, Sat(6)->+2
    const daysToMonday = [1, 0, -1, -2, -3, 3, 2][dayOfWeek]!;
    date.setDate(date.getDate() + daysToMonday);

    return date.toISOString().split('T')[0]!;
  }

  /**
   * Calculate an end date based on start date and duration in weeks.
   * Each week is 5 business days (excludes weekends).
   * Returns date in YYYY-MM-DD format.
   */
  private calculateEndDate(startDate: string, weeks: number): string {
    const date = new Date(startDate);
    const businessDays = weeks * 5;
    let daysAdded = 0;

    while (daysAdded < businessDays) {
      date.setDate(date.getDate() + 1);
      const dayOfWeek = date.getDay();
      // Skip Saturday (6) and Sunday (0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        daysAdded++;
      }
    }

    return date.toISOString().split('T')[0]!;
  }

  /**
   * Parse Level of Effort format.
   * Supports multiple formats:
   * - "#p/#w" (e.g., "2p/4w") - people/weeks
   * - "#w" or "# weeks" - just weeks
   * - "#" - just a number (treated as weeks)
   */
  private parseEnhancedLevelOfEffort(
    answer: string,
    notes: string,
    result: QuipParsedRequestFields,
  ): void {
    const effortText = `${answer} ${notes}`.trim();
    if (!effortText) return;

    const { totalWeeks, maxPeople } = this.extractLevelOfEffort(effortText);

    if (totalWeeks > 0 && result.executionWeeks === undefined) {
      result.executionWeeks = totalWeeks;
      // Calculate end date immediately after execution weeks are identified
      if (result.requestedStartDate && !result.requestedEndDate) {
        result.requestedEndDate = this.calculateEndDate(
          result.requestedStartDate,
          totalWeeks,
        );
      }
    }
    if (maxPeople > 0 && result.requiredMemberCount === undefined) {
      result.requiredMemberCount = maxPeople;
    }
  }

  /**
   * Extract weeks and people count from effort text.
   */
  private extractLevelOfEffort(text: string): {
    totalWeeks: number;
    maxPeople: number;
  } {
    // Try full LOE pattern: "#p/#w" (e.g., "2p/4w")
    const fullResult = this.parseFullLoePattern(text);
    if (fullResult.totalWeeks > 0) return fullResult;

    // Try just weeks pattern: "#w" or "# weeks"
    const weeksResult = this.parseWeeksPattern(text);
    if (weeksResult > 0) return { totalWeeks: weeksResult, maxPeople: 0 };

    // Fall back to first number as weeks
    const firstNumber = this.parseFirstNumber(text);
    return { totalWeeks: firstNumber, maxPeople: 0 };
  }

  private parseFullLoePattern(text: string): {
    totalWeeks: number;
    maxPeople: number;
  } {
    // Match patterns like "2p/2w", "2p / 2w", "2 p/2 w", "2 people/2 weeks", etc.
    const regex = /(\d+)\s*(?:p(?:eople)?)\s*[/\\]\s*(\d+)\s*(?:w(?:eeks?)?)/gi;
    let match: RegExpExecArray | null;
    let totalWeeks = 0;
    let maxPeople = 0;

    while ((match = regex.exec(text)) !== null) {
      const people = Number.parseInt(match[1]!, 10);
      const weeks = Number.parseInt(match[2]!, 10);
      if (!Number.isNaN(weeks)) totalWeeks += weeks;
      if (!Number.isNaN(people)) maxPeople = Math.max(maxPeople, people);
    }
    return { totalWeeks, maxPeople };
  }

  private parseWeeksPattern(text: string): number {
    const regex = /(\d+)\s*(?:w|weeks?)/gi;
    let match: RegExpExecArray | null;
    let totalWeeks = 0;

    while ((match = regex.exec(text)) !== null) {
      const weeks = Number.parseInt(match[1]!, 10);
      if (!Number.isNaN(weeks)) totalWeeks += weeks;
    }
    return totalWeeks;
  }

  private parseFirstNumber(text: string): number {
    const match = /(\d+)/.exec(text);
    if (!match) return 0;
    const num = Number.parseInt(match[1]!, 10);
    return Number.isNaN(num) ? 0 : num;
  }

  /**
   * Format description text with rows starting with numbers, columns tab-separated.
   * Filters out blank lines, short lines, and number-only lines.
   */
  private formatDescription(text: string): string {
    const rawLines = text.split('\n');
    const formattedRows: string[] = [];
    let currentRow: string[] = [];

    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!this.isValidDescriptionLine(trimmed)) continue;

      if (this.isNewRow(trimmed, currentRow.length)) {
        if (currentRow.length > 0) {
          formattedRows.push(currentRow.join('\t'));
        }
        currentRow = [trimmed];
      } else {
        currentRow.push(trimmed);
      }
    }

    if (currentRow.length > 0) {
      formattedRows.push(currentRow.join('\t'));
    }

    return formattedRows.join('\n');
  }

  private isValidDescriptionLine(line: string): boolean {
    if (line.length === 0) return false;
    // Strip all whitespace and zero-width characters
    const cleaned = this.stripZws(line.replaceAll(/\s/g, ''));
    if (cleaned.length <= 2) return false;
    // Skip lines that are only digits
    if (/^\d+$/.test(cleaned)) return false;
    return true;
  }

  private isNewRow(line: string, currentRowLength: number): boolean {
    // Line is just a number or starts with number + tab
    if (/^\d+\s*$/.test(line) || /^\d+\t/.test(line)) return true;
    // Line starts with number and no current row exists
    if (/^\d+/.test(line) && currentRowLength === 0) return true;
    return false;
  }

  /**
   * Extract client name from POC email address.
   * E.g., "john.doe@acme.com" -> "Acme"
   */
  private extractClientFromEmail(email: string): string | null {
    const emailRegex = /[\w.+-]+@([\w-]+)\./i;
    const emailMatch = emailRegex.exec(email);
    if (emailMatch?.[1]) {
      const domain = emailMatch[1];
      // Capitalize first letter
      return domain.charAt(0).toUpperCase() + domain.slice(1).toLowerCase();
    }
    return null;
  }

  private tableToCsv(html: string): string {
    const rows: string[][] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      cellRegex.lastIndex = 0;
      while ((cellMatch = cellRegex.exec(rowMatch[1]!)) !== null) {
        cells.push(this.stripZws(this.stripHtml(cellMatch[1]!)));
      }
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    return rows
      .map((cells) => cells.map((c) => this.escapeCsv(c)).join(','))
      .join('\n');
  }

  private extractFromCsv(
    csv: string,
    result: QuipParsedRequestFields,
  ): void {
    const descriptionParts: string[] = [];

    for (const line of csv.split('\n')) {
      const cells = this.parseCsvLine(line);
      const cleaned = cells.map((c) => this.stripZws(c));

      if (cleaned.length >= 3) {
        // Questionnaire 3-column format: Question | Answer | Notes
        this.extractFromQuestionnaireRow(
          cleaned[0] ?? '',
          cleaned[1] ?? '',
          cleaned[2] ?? '',
          result,
          descriptionParts,
        );
      } else if (cleaned.length === 2 && cleaned[0] && cleaned[1]) {
        // Legacy 2-column format: Field | Value
        const label = cleaned[0].trim().toLowerCase();
        const value = cleaned[1].trim();
        if (value) {
          this.assignField(label, value, result);
        }
      }
    }

    if (descriptionParts.length > 0) {
      result.description = descriptionParts.join('\n');
    }
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replaceAll('"', '""')}"`;
    }
    return value;
  }

  private parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
      i++;
    }
    cells.push(current);
    return cells;
  }

  private extractFromBoldLabels(
    html: string,
    result: QuipParsedRequestFields,
  ): void {
    const boldRegex =
      /<(?:b|strong)[^>]*>(.*?):\s*<\/(?:b|strong)>\s*(.*?)(?=<(?:br|p|div|b|strong|\/li|\/td)|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = boldRegex.exec(html)) !== null) {
      const label = this.stripHtml(match[1]!).trim().toLowerCase();
      const value = this.stripHtml(match[2]!).trim();
      if (value) {
        this.assignField(label, value, result);
      }
    }
  }

  private extractFromHeadings(
    html: string,
    result: QuipParsedRequestFields,
  ): void {
    const headingRegex =
      /<h[1-3][^>]*>(.*?)<\/h[1-3]>\s*([\s\S]*?)(?=<h[1-3]|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(html)) !== null) {
      const label = this.stripHtml(match[1]!).trim().toLowerCase();
      const value = this.stripHtml(match[2]!).trim();
      if (value) {
        this.assignField(label, value, result);
      }
    }
  }

  private assignField(
    label: string,
    value: string,
    result: QuipParsedRequestFields,
  ): void {
    const fieldName = this.fieldAliases[label];
    if (!fieldName) return;

    // Don't overwrite already-set values (first match wins)
    if (result[fieldName] !== undefined) return;

    switch (fieldName) {
      case 'preparationWeeks':
      case 'executionWeeks':
      case 'reportingWeeks':
      case 'studentCount':
      case 'requiredMemberCount': {
        const num = Number.parseInt(value, 10);
        if (!Number.isNaN(num))
          (result as Record<string, unknown>)[fieldName] = num;
        break;
      }
      case 'skillNames':
        (result as Record<string, unknown>)[fieldName] = value
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      default:
        (result as Record<string, unknown>)[fieldName] = value;
    }
  }

  private coerceNumericFields(result: QuipParsedRequestFields): void {
    const numericFields: (keyof QuipParsedRequestFields)[] = [
      'preparationWeeks',
      'executionWeeks',
      'reportingWeeks',
      'studentCount',
      'requiredMemberCount',
    ];
    for (const field of numericFields) {
      if (typeof result[field] === 'string') {
        const num = Number.parseInt(result[field], 10);
        (result as Record<string, unknown>)[field] = Number.isNaN(num)
          ? undefined
          : num;
      }
    }
  }

  /**
   * Convert full HTML documents to readable plain text.
   * Preserves table structure using tab-separated columns and
   * removes blank lines from the output.
   */
  htmlToText(html: string): string {
    return html
      // Table structure: cells separated by tabs, rows by newlines
      .replaceAll(/<\/td>\s*<td[^>]*>/gi, '\t')
      .replaceAll(/<\/tr>/gi, '\n')
      // Block elements become newlines
      .replaceAll(/<br\s*\/?>/gi, '\n')
      .replaceAll(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
      // Strip remaining tags
      .replaceAll(/<[^>]+>/g, '')
      // Decode HTML entities
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      // Remove blank lines and trim
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .join('\n')
      .trim();
  }

  /** Strip zero-width space characters and trim whitespace. */
  private stripZws(value: string): string {
    return value
      .replaceAll('\u200B', '')
      .replaceAll('\u200C', '')
      .replaceAll('\u200D', '')
      .replaceAll('\u2060', '')
      .replaceAll('\uFEFF', '')
      .trim();
  }

  /**
   * Extract client name from document title.
   * Expected format: "Prefix - CLIENTNAME - Rest"
   * Falls back to the full title if the pattern doesn't match.
   */
  private parseClientFromTitle(title: string): string {
    const segments = title.split(' - ');
    if (segments.length >= 3) {
      return segments[1]!.trim();
    }
    return title.trim();
  }

  /**
   * Process a single row from the questionnaire-format table.
   * Maps known fields via aliases and aggregates all non-empty
   * content into the description.
   */
  private extractFromQuestionnaireRow(
    question: string,
    answer: string,
    notes: string,
    result: QuipParsedRequestFields,
    descriptionParts: string[],
  ): void {
    const q = question.trim();
    const a = answer.trim();
    const n = notes.trim();
    const label = q.toLowerCase();

    if (!q) return;

    // Skip header row
    if (label === 'question') return;

    const isBlankAnswer = !a || a.toLowerCase() === 'none';

    // Special handling: Level of Effort
    if (label === 'level of effort') {
      this.parseLevelOfEffort(q, a, n, result, descriptionParts);
      return;
    }

    // Map non-blank answers to structured fields via aliases
    if (!isBlankAnswer) {
      this.assignField(label, a, result);
    }

    // For fields where the value is in the Notes column (e.g., Technologies)
    if (isBlankAnswer && n) {
      this.assignField(label, n, result);
    }

    // Aggregate into description
    if (!isBlankAnswer && n) {
      descriptionParts.push(`${q}: ${a} - ${n}`);
    } else if (!isBlankAnswer) {
      descriptionParts.push(`${q}: ${a}`);
    } else if (n) {
      descriptionParts.push(`${q}: ${n}`);
    }
  }

  /**
   * Parse Level of Effort field.
   * Format: "#p/#w" (e.g., "2p/4w", "Internal - 2p/4w, External - 2p/1w")
   * - Number before 'p' = required member count
   * - Number before 'w' = execution weeks
   */
  private parseLevelOfEffort(
    question: string,
    answer: string,
    notes: string,
    result: QuipParsedRequestFields,
    descriptionParts: string[],
  ): void {
    // Use the same logic as parseEnhancedLevelOfEffort
    this.parseEnhancedLevelOfEffort(answer, notes, result);

    // Always add to description
    if (answer && notes) {
      descriptionParts.push(`${question}: ${answer} - ${notes}`);
    } else if (answer) {
      descriptionParts.push(`${question}: ${answer}`);
    } else if (notes) {
      descriptionParts.push(`${question}: ${notes}`);
    }
  }

  /** Strip HTML tags and decode entities from a small fragment. */
  private stripHtml(html: string): string {
    return html
      .replaceAll(/<[^>]+>/g, '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .trim();
  }
}
