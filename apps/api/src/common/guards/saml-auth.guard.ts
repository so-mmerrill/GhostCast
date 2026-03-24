import { CanActivate, ExecutionContext, Inject, Injectable, BadRequestException, Optional } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

const PassportSamlGuard = AuthGuard('saml');

@Injectable()
export class SamlAuthGuard extends PassportSamlGuard implements CanActivate {
  constructor(
    @Optional() @Inject('SAML_STRATEGY') private readonly samlStrategy: unknown,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!this.samlStrategy) {
      throw new BadRequestException('SAML SSO is not configured');
    }
    return super.canActivate(context);
  }
}
