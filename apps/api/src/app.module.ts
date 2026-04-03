import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';

// Configuration
import configuration from './config/configuration';
import { validationSchema } from './config/validation';

// Core modules
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MembersModule } from './modules/members/members.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { ProjectTypesModule } from './modules/project-types/project-types.module';
import { SkillsModule } from './modules/skills/skills.module';
import { ProjectRolesModule } from './modules/project-roles/project-roles.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { AdminModule } from './modules/admin/admin.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { PluginsModule } from './plugins/plugins.module';
import { HealthModule } from './modules/health/health.module';
import { RequestsModule } from './modules/requests/requests.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { FormattersModule } from './modules/formatters/formatters.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { UserSettingsModule } from './modules/user-settings/user-settings.module';
import { LlmChatModule } from './modules/llm-chat/llm-chat.module';
import { KantataModule } from './modules/kantata/kantata.module';
import { QuipModule } from './modules/quip/quip.module';
import { PdfResumeImportModule } from './modules/pdf-resume-import/pdf-resume-import.module';
import { BackupModule } from './modules/backup/backup.module';

// Guards
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PasswordResetGuard } from './common/guards/password-reset.guard';
import { RbacGuard } from './common/guards/rbac.guard';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      envFilePath: '../../.env',
      load: [configuration],
      validationSchema,
      validationOptions: {
        abortEarly: true,
      },
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const throttlers = [
          {
            name: 'short',
            ttl: config.get<number>('rateLimit.shortTtl', 1000),
            limit: config.get<number>('rateLimit.shortMax', 10),
          },
          {
            name: 'medium',
            ttl: config.get<number>('rateLimit.mediumTtl', 10000),
            limit: config.get<number>('rateLimit.mediumMax', 50),
          },
          {
            name: 'long',
            ttl: config.get<number>('rateLimit.longTtl', 60000),
            limit: config.get<number>('rateLimit.longMax', 300),
          },
          {
            name: 'login',
            ttl: config.get<number>('rateLimit.loginTtl', 60000),
            limit: config.get<number>('rateLimit.loginMax', 5),
          },
        ];
        console.log('[Throttler] Resolved config:', JSON.stringify(throttlers));
        console.log('[Throttler] Raw env check - THROTTLE_SHORT_MAX:', process.env.THROTTLE_SHORT_MAX);
        console.log('[Throttler] ConfigService rateLimit:', JSON.stringify(config.get('rateLimit')));
        return throttlers;
      },
    }),

    // Scheduled tasks
    ScheduleModule.forRoot(),

    // Event emitter for internal events
    EventEmitterModule.forRoot(),

    // Core modules
    DatabaseModule,
    AuthModule,
    UsersModule,
    MembersModule,
    AssignmentsModule,
    ProjectTypesModule,
    SkillsModule,
    ProjectRolesModule,
    NotificationsModule,
    AuditModule,
    AdminModule,
    RealtimeModule,
    PluginsModule,
    HealthModule,
    RequestsModule,
    IntegrationsModule,
    FormattersModule,
    IngestionModule,
    UserSettingsModule,
    LlmChatModule,
    KantataModule,
    QuipModule,
    PdfResumeImportModule,
    BackupModule,
  ],
  providers: [
    // Global JWT guard (applied to all routes by default)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global password reset guard (blocks API access until password is changed)
    {
      provide: APP_GUARD,
      useClass: PasswordResetGuard,
    },
    // Global RBAC guard
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
