import {
  Controller,
  Post,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  PayloadTooLargeException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PdfResumeImportService } from './pdf-resume-import.service';
import { ApplyResumeDto } from './dto/apply-resume.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@ghostcast/shared';
import { User } from '@ghostcast/database';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Controller('pdf-resume-import')
export class PdfResumeImportController {
  private readonly logger = new Logger(PdfResumeImportController.name);

  constructor(
    private readonly pdfResumeImportService: PdfResumeImportService,
  ) {}

  /**
   * Upload and parse a PDF resume, extracting structured fields using AI
   */
  @Post('parse')
  @Roles(Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'PARSE', entity: 'PdfResume' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_FILE_SIZE,
      },
      fileFilter: (_req, file, callback) => {
        if (file.mimetype !== 'application/pdf') {
          callback(
            new BadRequestException('Only PDF files are allowed'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async parseResume(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new PayloadTooLargeException(
        `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    // Extract text from PDF
    const resumeText = await this.pdfResumeImportService.extractTextFromPdf(
      file.buffer,
    );

    // Parse with AI
    const result = await this.pdfResumeImportService.parseResumeWithAI(
      user.id,
      resumeText,
    );

    this.logger.log('Parsed resume result:', JSON.stringify(result, null, 2));

    return result;
  }

  /**
   * Apply parsed resume fields to a member's profile
   */
  @Post('apply/:memberId')
  @Roles(Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'UPDATE', entity: 'Member' })
  async applyToMember(
    @Param('memberId') memberId: string,
    @Body() dto: ApplyResumeDto,
  ) {
    const member = await this.pdfResumeImportService.applyToMember(
      memberId,
      {
        resume: dto.resume,
        certification: dto.certification,
        training: dto.training,
        education: dto.education,
      },
      dto.replaceExisting ?? true,
    );

    return member;
  }
}
