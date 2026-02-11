import { Controller, Get, Req, Res, UseGuards, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const user = await this.authService.validateUserByEmail(body.email, body.password);
    if (!user) {
      throw new BadRequestException('Invalid credentials');
    }
    return await this.authService.login(user);
  }

  @Post('signup')
  async signup(@Body() body: { email: string; name: string; password: string }) {
    try {
      const user = await this.authService.createUser(body.email, body.name, body.password);
      return await this.authService.login(user);
    } catch (error) {
      // If it's already a BadRequestException, re-throw it
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Otherwise, wrap it
      throw new BadRequestException(error.message || 'Failed to create user');
    }
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Initiates Google OAuth flow
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    const result = await this.authService.login(user);
    
    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/google/callback?token=${result.access_token}`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: Request) {
    const user = req.user as any;
    const fullUser = await this.authService.getUserById(user.id || user.sub);
    // Return user data in expected format
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
  async updateSettings(@Req() req: Request, @Body() body: {
    email?: string;
    password?: string;
    defaultLanguage?: string;
    defaultModelId?: string;
  }) {
    const user = req.user as any;
    return await this.authService.updateUserSettings(user.id || user.sub, body);
  }
}
