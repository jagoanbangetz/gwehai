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
    // Force log to ensure we see this
    console.error('========================================');
    console.error('[SSE Guard] CAN ACTIVATE CALLED');
    console.error('========================================');
    
    const request = context.switchToHttp().getRequest();
    
    // EventSource doesn't support custom headers, so we accept token as query param
    // But we validate it the same way as regular JWT auth
    let token = request.query?.token as string;
    
    console.error('[SSE Guard] Step 1 - Token from request.query:', token ? 'EXISTS' : 'MISSING');
    console.error('[SSE Guard] Step 1 - Token length:', token ? token.length : 0);
    
    // If token not in query, try to extract from URL directly (fallback)
    if (!token && request.url) {
      console.error('[SSE Guard] Step 2 - Trying to extract from URL');
      const urlMatch = request.url.match(/[?&]token=([^&]+)/);
      if (urlMatch) {
        token = decodeURIComponent(urlMatch[1]);
        console.error('[SSE Guard] Step 2 - Extracted token from URL, length:', token.length);
      } else {
        console.error('[SSE Guard] Step 2 - No token found in URL pattern');
      }
    }
    
    // Fallback: try Authorization header (for testing with curl, etc.)
    if (!token) {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.error('[SSE Guard] Step 3 - Using token from Authorization header');
      }
    }
    
    if (!token) {
      console.error('[SSE Guard] ERROR - No token provided at all');
      console.error('[SSE Guard] Request URL:', request.url);
      console.error('[SSE Guard] Request query:', JSON.stringify(request.query));
      throw new UnauthorizedException('Token required');
    }

    console.error('[SSE Guard] Step 4 - Token found, length:', token.length);
    console.error('[SSE Guard] Step 4 - Token preview:', token.substring(0, 30) + '...' + token.substring(token.length - 30));
    
    // Check if token might be truncated (JWT should have 3 parts separated by dots)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.error('[SSE Guard] ERROR - Token malformed! Parts:', tokenParts.length);
      throw new UnauthorizedException('Invalid token format');
    }

    try {
      // Use the same JWT secret and validation as the auth module
      const secret = this.configService.get<string>('JWT_SECRET') || 'your-super-secret-jwt-key';
      console.error('[SSE Guard] Step 5 - Using JWT secret (first 10 chars):', secret.substring(0, 10));
      
      // Verify the token (same as JwtStrategy does)
      console.error('[SSE Guard] Step 6 - Verifying token...');
      const payload = await this.jwtService.verifyAsync(token, {
        secret,
      });
      console.error('[SSE Guard] Step 7 - Token verified! Payload:', JSON.stringify({ sub: payload.sub, id: payload.id, email: payload.email }));
      
      // Validate the user exists (same as JwtStrategy.validate does)
      const userId = payload.sub || payload.id;
      if (!userId) {
        console.error('[SSE Guard] ERROR - No userId in token payload');
        throw new UnauthorizedException('Invalid token payload');
      }
      
      console.error('[SSE Guard] Step 8 - Validating user with ID:', userId);
      const user = await this.authService.validateUser(userId);
      if (!user) {
        console.error('[SSE Guard] ERROR - User not found for userId:', userId);
        throw new UnauthorizedException('User not found');
      }
      
      console.error('[SSE Guard] Step 9 - User validated:', user.id, user.email);
      
      // Set user in request (same format as JwtStrategy)
      request.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        sub: user.id, // For compatibility
      };
      
      console.error('[SSE Guard] SUCCESS - Authentication passed!');
      return true;
    } catch (error: any) {
      // Provide specific error messages
      console.error('[SSE Guard] ERROR - Exception caught:', error.name, error.message);
      console.error('[SSE Guard] ERROR - Stack:', error.stack?.substring(0, 200));
      
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired. Please login again.');
      }
      if (error.name === 'JsonWebTokenError') {
        console.error('[SSE Guard] JWT Error details:', error.message);
        throw new UnauthorizedException(`Invalid token: ${error.message}`);
      }
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(`Token validation failed: ${error.message}`);
    }
  }
}
