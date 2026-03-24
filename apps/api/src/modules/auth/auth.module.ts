import { Module, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { UsersModule } from '../users/users.module';

const logger = new Logger('AuthModule');

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    {
      provide: 'SAML_STRATEGY',
      useFactory: (configService: ConfigService, authService: AuthService) => {
        const samlEnabled = configService.get('saml.enabled');
        const samlCert = configService.get<string>('saml.cert');
        const samlEntryPoint = configService.get<string>('saml.entryPoint');

        logger.log(`SAML config check — enabled: ${samlEnabled}, cert present: ${!!samlCert}, entryPoint present: ${!!samlEntryPoint}`);

        if (samlEnabled !== true || !samlCert || !samlEntryPoint) {
          logger.log('SAML SSO disabled — skipping strategy registration');
          return null;
        }

        try {
          const { Strategy } = require('@node-saml/passport-saml');
          const passport = require('passport');

          // Wrap raw base64 cert in PEM headers if not already present
          const pemCert = samlCert.startsWith('-----BEGIN CERTIFICATE-----')
            ? samlCert
            : `-----BEGIN CERTIFICATE-----\n${samlCert}\n-----END CERTIFICATE-----`;

          const strategy = new Strategy(
            {
              entryPoint: samlEntryPoint,
              issuer: configService.get<string>('saml.issuer') || 'ghostcast',
              idpCert: pemCert,
              callbackUrl: configService.get<string>('saml.callbackUrl') || '',
              wantAssertionsSigned: true,
              wantAuthnResponseSigned: false,
              acceptedClockSkewMs: 300000, // (5 minute clock skew)
              identifierFormat: null,
            },
            async (profile: any, done: any) => {
              try {
                const email =
                  profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
                  profile.nameID;
                const firstName =
                  (profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] as string) || '';
                const lastName =
                  (profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] as string) || '';

                const user = await authService.validateOrProvisionSamlUser({
                  email: Array.isArray(email) ? email[0] : email,
                  firstName: Array.isArray(firstName) ? firstName[0] : firstName,
                  lastName: Array.isArray(lastName) ? lastName[0] : lastName,
                  ssoSubject: profile.nameID,
                });
                done(null, user);
              } catch (err) {
                done(err);
              }
            },
          );

          passport.use('saml', strategy);
          logger.log('SAML SSO strategy registered successfully');
          return strategy;
        } catch (error) {
          logger.error(`Failed to initialize SAML strategy: ${error instanceof Error ? error.message : error}. App will start without SSO.`);
          return null;
        }
      },
      inject: [ConfigService, AuthService],
    },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
