import { Controller, Get, Req, Res, UseGuards, Post, Body, BadRequestException, UseFilters } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MailService } from '../mail/mail.service';
import { GoogleAuthExceptionFilter } from './filters/google-auth-exception.filter';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mailService: MailService,
  ) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Req() req: Request) {
    const user = await this.authService.validateUserByEmail(body.email, body.password);
    if (!user) {
      throw new BadRequestException('Invalid credentials');
    }
    const ip = this.authService.getClientIp(req);
    const result = await this.authService.loginWithIp(user, ip);
    if (result.requiresOtp) {
      return result;
    }
    return result;
  }

  @Post('verify-login-otp')
  async verifyLoginOtp(
    @Body() body: { email: string; otp: string },
    @Req() req: Request,
  ) {
    const ip = this.authService.getClientIp(req);
    return await this.authService.verifyLoginOtp(body.email, body.otp, ip);
  }

  @Post('signup')
  async signup(
    @Body() body: { email: string; name: string; password: string },
    @Req() req: Request,
  ) {
    if (!body.email || !body.name || !body.password) {
      throw new BadRequestException('Email, name and password are required');
    }
    const ip = this.authService.getClientIp(req);
    if (this.mailService.isConfigured()) {
      return await this.authService.signupWithOtp(body.email, body.name, body.password, ip);
    }
    const user = await this.authService.createUser(body.email, body.name, body.password, ip);
    return await this.authService.login(user);
  }

  @Post('verify-signup-otp')
  async verifySignupOtp(
    @Body() body: { email: string; otp: string },
    @Req() req: Request,
  ) {
    const ip = this.authService.getClientIp(req);
    return await this.authService.verifySignupOtp(body.email, body.otp, ip);
  }

  @Get('verify-signup')
  async verifySignupByLink(@Req() req: Request) {
    const token = (req.query?.token as string)?.trim();
    if (!token) throw new BadRequestException('Token is required');
    return await this.authService.verifySignupByToken(token);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    if (!body.email?.trim()) {
      throw new BadRequestException('Email is required');
    }
    return await this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; password: string }) {
    if (!body.token?.trim()) throw new BadRequestException('Token is required');
    if (!body.password) throw new BadRequestException('Password is required');
    return await this.authService.resetPassword(body.token, body.password);
  }

  /** Debug: returns the exact redirect_uri sent to Google. Copy this into Google Console → Authorized redirect URIs. */
  @Get('google/redirect-uri')
  getGoogleRedirectUri() {
    const port = process.env.PORT || 3001;
    const url = process.env.GOOGLE_CALLBACK_URL || `http://localhost:${port}/api/auth/google/callback`;
    return { redirect_uri: url };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @UseFilters(GoogleAuthExceptionFilter)
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    const result = await this.authService.login(user);
    // Vite dev server is usually :5173; use FRONTEND_URL in .env to match where your app runs
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const token = encodeURIComponent(result.access_token);
    res.redirect(`${frontendUrl}/auth/google/callback?token=${token}`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: Request) {
    const user = req.user as any;
    const fullUser = await this.authService.getUserById(user.id || user.sub);
    return {
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name,
      avatarUrl: fullUser.avatarUrl,
      role: fullUser.role,
      defaultLanguage: fullUser.defaultLanguage || 'en',
      defaultModelId: fullUser.defaultModelId,
      googleId: fullUser.googleId,
    };
  }

  @Post('settings')
  @UseGuards(JwtAuthGuard)
  async updateSettings(
    @Req() req: Request,
    @Body() body: { email?: string; password?: string; defaultLanguage?: string; defaultModelId?: string },
  ) {
    const user = req.user as any;
    return await this.authService.updateUserSettings(user.id || user.sub, body);
  }
}
