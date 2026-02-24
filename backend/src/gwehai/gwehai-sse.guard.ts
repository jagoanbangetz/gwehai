import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class GwehAISSEGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // EventSource doesn't support custom headers, so we accept token as query param.
    let token = request.query?.token as string;

    // If token not in query, try to extract from URL directly (fallback).
    if (!token && request.url) {
      const urlMatch = request.url.match(/[?&]token=([^&]+)/);
      if (urlMatch) {
        token = decodeURIComponent(urlMatch[1]);
      }
    }

    // Fallback: try Authorization header (for testing with curl, etc.).
    if (!token) {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      throw new UnauthorizedException('Token required');
    }

    // Check if token might be truncated (JWT should have 3 parts separated by dots).
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      throw new UnauthorizedException('Invalid token format');
    }

    try {
      // Use the same JWT secret and validation as the auth module.
      const secret = this.configService.get<string>('JWT_SECRET') || 'your-super-secret-jwt-key';

      // Verify the token (same as JwtStrategy does).
      const payload = await this.jwtService.verifyAsync(token, {
        secret,
      });

      // Validate the user exists (same as JwtStrategy.validate does).
      const userId = payload.sub || payload.id;
      if (!userId) {
        throw new UnauthorizedException('Invalid token payload');
      }

      const user = await this.authService.validateUser(userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Set user in request (same format as JwtStrategy).
      request.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        sub: user.id, // For compatibility
      };

      return true;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired. Please login again.');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token');
      }
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token validation failed');
    }
  }
}
