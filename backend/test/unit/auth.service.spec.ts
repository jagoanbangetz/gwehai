import { BadRequestException } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../src/entities/user.entity';
import { VerificationCode } from '../../src/entities/verification-code.entity';
import { PendingSignup } from '../../src/entities/pending-signup.entity';
import { MailService } from '../../src/mail/mail.service';
import { PointsService } from '../../src/points/points.service';

describe('AuthService', () => {
  const userRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const verificationRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const pendingSignupRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('jwt-token') };
  const pointsService = { grantPoints: jest.fn().mockResolvedValue(undefined) };
  const mailService = {
    isConfigured: jest.fn().mockReturnValue(true),
    sendOtp: jest.fn().mockResolvedValue(true),
    sendSignupVerification: jest.fn().mockResolvedValue(true),
    sendPasswordResetLink: jest.fn().mockResolvedValue(true),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    (jwtService as any).sign.mockReturnValue('jwt-token');
    (mailService as any).isConfigured.mockReturnValue(true);
    (mailService as any).sendOtp.mockResolvedValue(true);
    (mailService as any).sendSignupVerification.mockResolvedValue(true);
    (mailService as any).sendPasswordResetLink.mockResolvedValue(true);
    verificationRepo.delete.mockResolvedValue(undefined);
    verificationRepo.save.mockResolvedValue(undefined);
    verificationRepo.create.mockImplementation((o: any) => o);
    service = new AuthService(
      userRepo as any,
      verificationRepo as any,
      pendingSignupRepo as any,
      jwtService as any,
      pointsService as any,
      mailService as any,
    );
  });

  describe('getClientIp', () => {
    it('returns x-forwarded-for first value', () => {
      const req = { headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }, socket: {} };
      expect(service.getClientIp(req)).toBe('10.0.0.1');
    });
    it('returns socket.remoteAddress when no x-forwarded-for', () => {
      const req = { headers: {}, socket: { remoteAddress: '::1' } };
      expect(service.getClientIp(req)).toBe('::1');
    });
  });

  describe('loginWithIp', () => {
    it('returns requiresOtp when IP differs and mail configured', async () => {
      (mailService as any).isConfigured.mockReturnValue(true);
      const user = {
        id: 'u1',
        email: 'a@b.com',
        lastLoginIp: '1.2.3.4',
        name: 'A',
        avatarUrl: null,
        role: 'user',
      };
      verificationRepo.delete.mockResolvedValue(undefined);
      verificationRepo.create.mockImplementation((o: any) => o);
      verificationRepo.save.mockResolvedValue({});

      const result = await service.loginWithIp(user as any, '5.6.7.8');

      expect(result.requiresOtp).toBe(true);
      expect(mailService.sendOtp).toHaveBeenCalledWith('a@b.com', expect.any(String), 'login');
    });

    it('returns token when same IP', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.com',
        lastLoginIp: '127.0.0.1',
        name: 'A',
        avatarUrl: null,
        role: 'user',
      };
      userRepo.save.mockResolvedValue(user);

      const result = await service.loginWithIp(user as any, '127.0.0.1');

      expect(result.requiresOtp).toBe(false);
      expect((result as any).access_token).toBe('jwt-token');
    });

    it('returns token when no lastLoginIp (first login)', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.com',
        lastLoginIp: null,
        name: 'A',
        avatarUrl: null,
        role: 'user',
      };
      userRepo.save.mockResolvedValue(user);

      const result = await service.loginWithIp(user as any, '127.0.0.1');

      expect(result.requiresOtp).toBe(false);
      expect((result as any).access_token).toBe('jwt-token');
    });
  });

  describe('verifyLoginOtp', () => {
    it('returns token when OTP valid', async () => {
      const code = {
        id: 'c1',
        email: 'a@b.com',
        purpose: 'login',
        code: '123456',
        expiresAt: new Date(Date.now() + 60000),
      };
      const user = { id: 'u1', email: 'a@b.com', name: 'A', avatarUrl: null, role: 'user' };
      verificationRepo.findOne.mockResolvedValue(code);
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue(user);
      verificationRepo.delete.mockResolvedValue(undefined);

      const result = await service.verifyLoginOtp('a@b.com', '123456', '127.0.0.1');

      expect(result.access_token).toBe('jwt-token');
      expect(verificationRepo.delete).toHaveBeenCalledWith({ id: code.id });
    });

    it('throws when OTP invalid', async () => {
      verificationRepo.findOne.mockResolvedValue(null);

      await expect(service.verifyLoginOtp('a@b.com', '000000', null)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('signupWithOtp', () => {
    it('creates pending signup and sends verification email with link + OTP', async () => {
      userRepo.findOne.mockResolvedValue(null);
      pendingSignupRepo.delete.mockResolvedValue(undefined);
      pendingSignupRepo.create.mockImplementation((o: any) => o);
      pendingSignupRepo.save.mockResolvedValue(undefined);
      verificationRepo.delete.mockResolvedValue(undefined);
      verificationRepo.create.mockImplementation((o: any) => o);
      verificationRepo.save.mockResolvedValue(undefined);

      const result = await service.signupWithOtp('a@b.com', 'A', 'password123');

      expect(result.requiresOtp).toBe(true);
      expect((mailService as any).sendSignupVerification).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringContaining('/verify-signup?token='),
        expect.any(String),
      );
      expect(pendingSignupRepo.save).toHaveBeenCalled();
    });

    it('throws when email already exists', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', email: 'a@b.com' });

      await expect(service.signupWithOtp('a@b.com', 'A', 'password123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('verifySignupOtp', () => {
    it('creates user and returns token', async () => {
      const pending = {
        email: 'a@b.com',
        name: 'A',
        password_hash: 'hash',
        otp_code: '123456',
        expires_at: new Date(Date.now() + 60000),
      };
      const user = { id: 'u1', email: 'a@b.com', name: 'A', avatarUrl: null, role: 'user' };
      pendingSignupRepo.findOne.mockResolvedValue(pending);
      userRepo.create.mockReturnValue(user);
      userRepo.save.mockResolvedValue(user);
      pendingSignupRepo.delete.mockResolvedValue(undefined);

      const result = await service.verifySignupOtp('a@b.com', '123456');

      expect((result as any).access_token).toBe('jwt-token');
      expect(userRepo.save).toHaveBeenCalled();
      expect(pendingSignupRepo.delete).toHaveBeenCalledWith({ email: 'a@b.com' });
    });

    it('throws when OTP wrong', async () => {
      pendingSignupRepo.findOne.mockResolvedValue({
        email: 'a@b.com',
        otp_code: '123456',
        expires_at: new Date(Date.now() + 60000),
      });

      await expect(service.verifySignupOtp('a@b.com', '000000')).rejects.toThrow(BadRequestException);
    });
  });

  describe('forgotPassword', () => {
    it('sends reset link when user exists', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', email: 'a@b.com', password_hash: 'hash' });
      verificationRepo.delete.mockResolvedValue(undefined);
      verificationRepo.create.mockImplementation((o: any) => o);
      verificationRepo.save.mockResolvedValue(undefined);

      const result = await service.forgotPassword('a@b.com');

      expect(result.message).toBeDefined();
      expect((mailService as any).sendPasswordResetLink).toHaveBeenCalled();
    });

    it('returns same message when user does not exist (no leak)', async () => {
      userRepo.findOne.mockResolvedValue(null);

      const result = await service.forgotPassword('unknown@b.com');

      expect(result.message).toBeDefined();
      expect(mailService.sendPasswordResetLink).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates password and deletes token', async () => {
      const code = {
        id: 'c1',
        email: 'a@b.com',
        purpose: 'password_reset',
        code: 'token123',
        expiresAt: new Date(Date.now() + 60000),
      };
      const user = { id: 'u1', email: 'a@b.com', password_hash: 'old' };
      verificationRepo.findOne.mockResolvedValue(code);
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue({ ...user, password_hash: 'new' });
      verificationRepo.delete.mockResolvedValue(undefined);

      const result = await service.resetPassword('token123', 'newpass123');

      expect(result.message).toContain('reset');
      expect(userRepo.save).toHaveBeenCalled();
      expect(verificationRepo.delete).toHaveBeenCalledWith({ id: 'c1' });
    });

    it('throws when token invalid', async () => {
      verificationRepo.findOne.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'newpass123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
