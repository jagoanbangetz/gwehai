import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../entities/user.entity';
import { PointsService } from '../points/points.service';
import { PointLedgerReason } from '../entities/point-ledger.entity';
import { VerificationCode } from '../entities/verification-code.entity';
import { PendingSignup } from '../entities/pending-signup.entity';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { randomInt, randomBytes } from 'crypto';

/** Default points granted on registration (signup). */
const SIGNUP_BONUS_POINTS = 10;

/** OTP validity in minutes. */
const OTP_EXPIRY_MINUTES = 5;

/** Password reset token validity in minutes. */
const RESET_TOKEN_EXPIRY_MINUTES = 60;

function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

function getClientIp(req: { headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string | null {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return first?.split(',')[0]?.trim() ?? null;
  }
  return (req.socket as any)?.remoteAddress ?? null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(VerificationCode)
    private verificationRepo: Repository<VerificationCode>,
    @InjectRepository(PendingSignup)
    private pendingSignupRepo: Repository<PendingSignup>,
    private jwtService: JwtService,
    private pointsService: PointsService,
    private mailService: MailService,
  ) {}

  getClientIp(req: Parameters<typeof getClientIp>[0]): string | null {
    return getClientIp(req);
  }

  async validateGoogleUser(profile: any): Promise<User> {
    const id = profile?.id;
    const emails = profile?.emails;
    const name = profile?.name;
    const photos = profile?.photos;
    const email = emails?.[0]?.value?.trim()?.toLowerCase();

    if (!id) {
      throw new BadRequestException('Google profile missing id');
    }

    let user = await this.userRepo.findOne({
      where: { googleId: id },
    });

    if (user) {
      user.email = email || user.email;
      user.name = name?.displayName || name?.givenName || user.name;
      user.avatarUrl = photos?.[0]?.value || user.avatarUrl;
      await this.userRepo.save(user);
      return user;
    }

    if (email) {
      user = await this.userRepo.findOne({
        where: { email },
      });
      if (user) {
        user.googleId = id;
        user.avatarUrl = photos?.[0]?.value || user.avatarUrl;
        await this.userRepo.save(user);
        return user;
      }
    }

    if (!email) {
      throw new BadRequestException('Google did not provide an email. Please allow email access.');
    }

    user = this.userRepo.create({
      googleId: id,
      email,
      name: name?.displayName || name?.givenName || 'User',
      avatarUrl: photos?.[0]?.value,
    });
    await this.userRepo.save(user);
    try {
      await this.pointsService.grantPoints(
        user.id,
        SIGNUP_BONUS_POINTS,
        PointLedgerReason.PROMOTION,
        'users',
        user.id,
        { source: 'signup_bonus', method: 'google_oauth' },
      );
    } catch (error) {
      console.error('Failed to grant signup bonus points:', error);
    }
    return user;
  }

  async login(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
    };
  }

  /**
   * Login with IP check. If IP differs from lastLoginIp, send OTP and return requiresOtp.
   */
  async loginWithIp(user: User, ip: string | null): Promise<
    | { requiresOtp: true; message: string }
    | { requiresOtp: false; access_token: string; user: object }
  > {
    const normalizedIp = ip?.trim() || null;
    const lastIp = user.lastLoginIp?.trim() || null;

    if (this.mailService.isConfigured() && normalizedIp && lastIp && normalizedIp !== lastIp) {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
      await this.verificationRepo.delete({ email: user.email!.toLowerCase(), purpose: 'login' });
      await this.verificationRepo.save(
        this.verificationRepo.create({
          email: user.email!.toLowerCase(),
          code: otp,
          purpose: 'login',
          expiresAt,
          metadata: { ip: normalizedIp },
        }),
      );
      await this.mailService.sendOtp(user.email!, otp, 'login');
      return { requiresOtp: true, message: 'OTP sent to your email. Enter it to complete login.' };
    }

    if (normalizedIp) {
      user.lastLoginIp = normalizedIp;
      await this.userRepo.save(user);
    }
    return { requiresOtp: false, ...(await this.login(user)) };
  }

  /**
   * Verify login OTP and return JWT.
   */
  async verifyLoginOtp(email: string, otp: string, ip: string | null): Promise<{ access_token: string; user: object }> {
    const normalizedEmail = email.trim().toLowerCase();
    const code = await this.verificationRepo.findOne({
      where: { email: normalizedEmail, purpose: 'login', code: otp.trim() },
    });
    if (!code || code.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired OTP');
    }
    const user = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    await this.verificationRepo.delete({ id: code.id });
    if (ip?.trim()) {
      user.lastLoginIp = ip.trim();
      await this.userRepo.save(user);
    }
    return this.login(user);
  }

  async validateUser(userId: string): Promise<User | null> {
    return await this.userRepo.findOne({
      where: { id: userId, isActive: true },
    });
  }

  async getUserById(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUserSettings(
    userId: string,
    settings: { email?: string; password?: string; defaultLanguage?: string; defaultModelId?: string },
  ): Promise<User> {
    const user = await this.getUserById(userId);
    if (settings.email && settings.email !== user.email) {
      const existing = await this.userRepo.findOne({ where: { email: settings.email } });
      if (existing && existing.id !== userId) throw new BadRequestException('Email already in use');
      user.email = settings.email;
    }
    if (settings.password) {
      if (settings.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
      user.password_hash = await bcrypt.hash(settings.password, 10);
    }
    if (settings.defaultLanguage) user.defaultLanguage = settings.defaultLanguage;
    if (settings.defaultModelId) user.defaultModelId = settings.defaultModelId;
    return await this.userRepo.save(user);
  }

  async validateUserByEmail(email: string, password: string): Promise<User | null> {
    const user = await this.userRepo.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!user || !user.password_hash) return null;
    const ok = await bcrypt.compare(password, user.password_hash);
    return ok ? user : null;
  }

  /**
   * Start signup: create pending signup, send OTP, return requiresOtp.
   */
  async signupWithOtp(email: string, name: string, password: string): Promise<{ requiresOtp: true; message: string }> {
    if (!email?.includes('@')) throw new BadRequestException('Invalid email format');
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    if (existing) throw new BadRequestException('Email already exists. Please use a different email or sign in.');
    if (!password || password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const password_hash = await bcrypt.hash(password, 10);

    await this.pendingSignupRepo.delete({ email: normalizedEmail }).catch(() => {});
    await this.pendingSignupRepo.save(
      this.pendingSignupRepo.create({
        email: normalizedEmail,
        name: name.trim(),
        password_hash,
        otp_code: otp,
        expires_at: expiresAt,
      }),
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verificationToken = randomBytes(32).toString('hex');
    await this.verificationRepo.delete({ email: normalizedEmail, purpose: 'signup_link' }).catch(() => {});
    await this.verificationRepo.save(
      this.verificationRepo.create({
        email: normalizedEmail,
        code: verificationToken,
        purpose: 'signup_link',
        expiresAt,
      }),
    );
    const verifyLink = `${frontendUrl}/verify-signup?token=${verificationToken}`;

    if (this.mailService.isConfigured()) {
      await this.mailService.sendSignupVerification(normalizedEmail, verifyLink, otp);
    }
    return { requiresOtp: true, message: 'Verification email sent. Click the link or enter the code to complete registration.' };
  }

  /**
   * Verify signup by link token (from email). Returns JWT.
   */
  async verifySignupByToken(token: string): Promise<{ access_token: string; user: object }> {
    const code = await this.verificationRepo.findOne({
      where: { code: token.trim(), purpose: 'signup_link' },
    });
    if (!code || code.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification link. Please sign up again.');
    }
    const normalizedEmail = code.email;
    const pending = await this.pendingSignupRepo.findOne({ where: { email: normalizedEmail } });
    if (!pending) {
      throw new BadRequestException('No pending signup. Please sign up again.');
    }
    const user = this.userRepo.create({
      email: normalizedEmail,
      name: pending.name,
      password_hash: pending.password_hash,
      defaultLanguage: 'en',
    });
    await this.userRepo.save(user);
    await this.verificationRepo.delete({ id: code.id });
    await this.pendingSignupRepo.delete({ email: normalizedEmail });

    try {
      await this.pointsService.grantPoints(
        user.id,
        SIGNUP_BONUS_POINTS,
        PointLedgerReason.PROMOTION,
        'users',
        user.id,
        { source: 'signup_bonus', method: 'email_password' },
      );
    } catch (error) {
      console.error('Failed to grant signup bonus points:', error);
    }
    return this.login(user);
  }

  /**
   * Verify signup OTP and create user, then return JWT.
   */
  async verifySignupOtp(email: string, otp: string): Promise<{ access_token: string; user: object }> {
    const normalizedEmail = email.trim().toLowerCase();
    const pending = await this.pendingSignupRepo.findOne({ where: { email: normalizedEmail } });
    if (!pending) throw new BadRequestException('No pending signup or OTP expired');
    if (pending.otp_code !== otp.trim()) throw new BadRequestException('Invalid OTP');
    if (pending.expires_at < new Date()) {
      await this.pendingSignupRepo.delete({ email: normalizedEmail });
      throw new BadRequestException('OTP expired. Please sign up again.');
    }

    const user = this.userRepo.create({
      email: normalizedEmail,
      name: pending.name,
      password_hash: pending.password_hash,
      defaultLanguage: 'en',
    });
    await this.userRepo.save(user);
    await this.pendingSignupRepo.delete({ email: normalizedEmail });

    try {
      await this.pointsService.grantPoints(
        user.id,
        SIGNUP_BONUS_POINTS,
        PointLedgerReason.PROMOTION,
        'users',
        user.id,
        { source: 'signup_bonus', method: 'email_password' },
      );
    } catch (error) {
      console.error('Failed to grant signup bonus points:', error);
    }
    return this.login(user);
  }

  /** Legacy: create user directly (no OTP). Kept for backward compatibility when SMTP not configured. */
  async createUser(email: string, name: string, password: string): Promise<User> {
    if (!email?.includes('@')) throw new BadRequestException('Invalid email format');
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    if (existing) throw new BadRequestException('Email already exists. Please use a different email or sign in.');
    if (!password || password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const password_hash = await bcrypt.hash(password, 10);
    const user = this.userRepo.create({
      email: normalizedEmail,
      name: name.trim(),
      password_hash,
      defaultLanguage: 'en',
    });
    await this.userRepo.save(user);
    try {
      await this.pointsService.grantPoints(
        user.id,
        SIGNUP_BONUS_POINTS,
        PointLedgerReason.PROMOTION,
        'users',
        user.id,
        { source: 'signup_bonus', method: 'email_password' },
      );
    } catch (error) {
      console.error('Failed to grant signup bonus points:', error);
    }
    return user;
  }

  /**
   * Forgot password: send reset link to email if user exists.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    if (!user?.password_hash) {
      return { message: 'If an account exists with this email, you will receive a password reset link.' };
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);
    await this.verificationRepo.delete({ email: normalizedEmail, purpose: 'password_reset' });
    await this.verificationRepo.save(
      this.verificationRepo.create({
        email: normalizedEmail,
        code: token,
        purpose: 'password_reset',
        expiresAt,
      }),
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;
    if (this.mailService.isConfigured()) {
      await this.mailService.sendPasswordResetLink(normalizedEmail, resetLink);
    }
    return { message: 'If an account exists with this email, you will receive a password reset link.' };
  }

  /**
   * Reset password using token from email link.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const code = await this.verificationRepo.findOne({
      where: { code: token.trim(), purpose: 'password_reset' },
    });
    if (!code || code.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset link. Please request a new one.');
    }
    const user = await this.userRepo.findOne({ where: { email: code.email } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    user.password_hash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.save(user);
    await this.verificationRepo.delete({ id: code.id });
    return { message: 'Password has been reset. You can now log in.' };
  }
}
