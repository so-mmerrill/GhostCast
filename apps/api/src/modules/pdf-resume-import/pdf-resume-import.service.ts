import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import pdfParse from 'pdf-parse';
import { LlmChatService } from '../llm-chat/llm-chat.service';
import { MembersService } from '../members/members.service';
import type { ParsedResumeFields } from '@ghostcast/shared';

export interface ParseResumeResult extends ParsedResumeFields {
  rawText: string;
}

@Injectable()
export class PdfResumeImportService {
  private readonly logger = new Logger(PdfResumeImportService.name);

  constructor(
    private readonly llmChatService: LlmChatService,
    private readonly membersService: MembersService,
  ) {}

  /**
   * Extract text content from a PDF buffer
   */
  async extractTextFromPdf(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);

      if (!data.text || data.text.trim().length === 0) {
        throw new BadRequestException(
          'The PDF file appears to be empty or contains no extractable text.',
        );
      }

      return data.text;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      this.logger.error('Failed to parse PDF:', error);
      throw new BadRequestException(
        'Failed to parse the PDF file. Please ensure it is a valid PDF document.',
      );
    }
  }

  /**
   * Parse resume text using AI to extract structured fields
   */
  async parseResumeWithAI(
    userId: string,
    resumeText: string,
  ): Promise<ParseResumeResult> {
    const parsedFields = await this.llmChatService.parseResumeDocument(
      userId,
      resumeText,
    );

    return {
      ...parsedFields,
      rawText: resumeText,
    };
  }

  /**
   * Apply parsed resume fields to a member's profile
   */
  async applyToMember(
    memberId: string,
    fields: ParsedResumeFields,
    replaceExisting: boolean = true,
  ) {
    // Verify member exists
    const existingMember = await this.membersService.findById(memberId);
    if (!existingMember) {
      throw new NotFoundException(`Member with ID ${memberId} not found`);
    }

    // Build update data
    const updateData: Partial<ParsedResumeFields> = {};

    if (fields.resume !== undefined) {
      updateData.resume = replaceExisting
        ? fields.resume
        : this.appendField(existingMember.resume, fields.resume);
    }

    if (fields.certification !== undefined) {
      updateData.certification = replaceExisting
        ? fields.certification
        : this.appendField(existingMember.certification, fields.certification);
    }

    if (fields.training !== undefined) {
      updateData.training = replaceExisting
        ? fields.training
        : this.appendField(existingMember.training, fields.training);
    }

    if (fields.education !== undefined) {
      updateData.education = replaceExisting
        ? fields.education
        : this.appendField(existingMember.education, fields.education);
    }

    // Update the member
    return this.membersService.update(memberId, updateData);
  }

  /**
   * Append new content to existing field value
   */
  private appendField(
    existing: string | null | undefined,
    newValue: string,
  ): string {
    if (!existing || existing.trim() === '') {
      return newValue;
    }
    return `${existing}\n\n--- Imported from PDF ---\n${newValue}`;
  }
}
