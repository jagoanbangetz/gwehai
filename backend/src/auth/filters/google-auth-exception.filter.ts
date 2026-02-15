import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { Request } from 'express';

/**
 * When Google OAuth callback fails (user denies, invalid state, missing email, etc.),
 * redirect to frontend with error so the user sees a message instead of a raw 401/400.
 */
@Catch(UnauthorizedException, BadRequestException)
export class GoogleAuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GoogleAuthExceptionFilter.name);

  catch(exception: UnauthorizedException | BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const path = req.url?.split('?')[0] || '';
    if (!path.includes('google/callback')) {
      throw exception;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const queryError = (req.query?.error as string) || 'google_auth_failed';
    const redirectUrl = `${frontendUrl}/auth/google/callback?error=${encodeURIComponent(queryError)}`;
    this.logger.warn(`Google OAuth callback failed: ${queryError}, redirecting to frontend`);
    res.redirect(redirectUrl);
  }
}
