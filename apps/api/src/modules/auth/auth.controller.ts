import {
  Controller,
  Post,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  Get,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { SamlAuthGuard } from '../../common/guards/saml-auth.guard';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@ghostcast/database';
import { Audit, SkipAudit } from '../../common/decorators/audit.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @UseGuards(AuthGuard('local'))
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle({ short: true, medium: true, long: true })
  @Throttle({ login: {} })
  @Audit({ action: 'LOGIN', entity: 'User' })
  async login(
    @Body() _loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const user = req.user as User;
    const result = await this.authService.login(user);

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // 'lax' allows cookie to be sent on same-site AJAX requests
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/', // Required: without explicit path, cookie uses request path and won't be sent on other routes
    });

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle({ short: true, medium: true, long: true, login: true })
  @SkipAudit()
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    // Get refresh token from cookie or body
    const refreshToken =
      req.cookies?.refreshToken || refreshTokenDto.refreshToken;

    const result = await this.authService.refreshTokens(refreshToken);

    // Update refresh token cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // 'lax' allows cookie to be sent on same-site AJAX requests
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/', // Required: without explicit path, cookie uses request path and won't be sent on other routes
    });

    return {
      accessToken: result.accessToken,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'LOGOUT', entity: 'User' })
  async logout(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await this.authService.logout(user.id, refreshToken);
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    return { message: 'Logged out successfully' };
  }

  @Public()
  @Get('password-policy')
  @SkipThrottle({ short: true, medium: true, long: true, login: true })
  @SkipAudit()
  async getPasswordPolicy() {
    return this.authService.getPasswordPolicy();
  }

  @Get('me')
  async me(@CurrentUser() user: User) {
    return this.authService.getProfile(user.id);
  }

  @Put('profile')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'UPDATE_PROFILE', entity: 'User' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() updateProfileDto: UpdateProfileDto
  ) {
    return this.authService.updateProfile(user.id, updateProfileDto);
  }

  @Put('password')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'CHANGE_PASSWORD', entity: 'User' })
  async changePassword(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() changePasswordDto: ChangePasswordDto
  ) {
    // Get current session token to preserve it
    const authHeader = req.headers.authorization;
    const currentToken = authHeader?.replace('Bearer ', '');

    await this.authService.changePassword(
      user.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
      currentToken
    );

    return { message: 'Password changed successfully' };
  }

  @Public()
  @Get('sso-config')
  @SkipThrottle({ short: true, medium: true, long: true, login: true })
  @SkipAudit()
  async getSsoConfig() {
    return {
      samlEnabled: this.configService.get<boolean>('saml.enabled', false),
    };
  }

  @Public()
  @Get('saml/login')
  @UseGuards(SamlAuthGuard)
  @SkipThrottle({ short: true, medium: true, long: true, login: true })
  async samlLogin() {
    // Passport SAML strategy handles the redirect to ADFS automatically.
    // This method body is never reached.
  }

  @Public()
  @Post('saml/callback')
  @UseGuards(SamlAuthGuard)
  @SkipThrottle({ short: true, medium: true, long: true, login: true })
  @Audit({ action: 'SSO_LOGIN', entity: 'User' })
  async samlCallback(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req.user as User;
    const result = await this.authService.login(user);

    // Set refresh token as httpOnly cookie (same pattern as local login)
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    // Redirect to frontend with access token
    const appUrl = this.configService.get<string>('appUrl');
    res.redirect(`${appUrl}/login?sso_token=${result.accessToken}`);
  }
}
