import { BadRequestException } from '@nestjs/common';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { MailService } from '../../src/mail/mail.service';

describe('AuthController', () => {
  const authService = {
    validateUserByEmail: jest.fn(),
    loginWithIp: jest.fn(),
    login: jest.fn(),
    verifyLoginOtp: jest.fn(),
    signupWithOtp: jest.fn(),
    createUser: jest.fn(),
    verifySignupOtp: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    getClientIp: jest.fn().mockReturnValue('127.0.0.1'),
    updateUserSettings: jest.fn(),
    getUserById: jest.fn(),
  } as unknown as AuthService;

  const mailService = {
    isConfigured: jest.fn().mockReturnValue(false),
  } as unknown as MailService;

  let controller: AuthController;

  beforeEach(() => {
    jest.resetAllMocks();
    (authService as any).getClientIp.mockReturnValue('127.0.0.1');
    (mailService as any).isConfigured.mockReturnValue(false);
    controller = new AuthController(authService as any, mailService as any);
  });

  it('logs in with valid credentials (no OTP when SMTP off)', async () => {
    const user = { id: 'u1', email: 'a@b.com', lastLoginIp: null };
    (authService as any).validateUserByEmail.mockResolvedValue(user);
    (authService as any).loginWithIp.mockResolvedValue({
      requiresOtp: false,
      access_token: 'token',
      user: { id: 'u1' },
    });

    const result = await controller.login(
      { email: 'a@b.com', password: 'secret' },
      { headers: {}, socket: {} } as any,
    );

    expect(result.requiresOtp).toBe(false);
    expect('access_token' in result && result.access_token).toBe('token');
    expect(authService.validateUserByEmail).toHaveBeenCalledWith('a@b.com', 'secret');
    expect(authService.loginWithIp).toHaveBeenCalledWith(user, '127.0.0.1');
  });

  it('returns requiresOtp when loginWithIp requires OTP', async () => {
    const user = { id: 'u1', email: 'a@b.com', lastLoginIp: '1.2.3.4' };
    (authService as any).validateUserByEmail.mockResolvedValue(user);
    (authService as any).loginWithIp.mockResolvedValue({
      requiresOtp: true,
      message: 'OTP sent to your email.',
    });

    const result = await controller.login(
      { email: 'a@b.com', password: 'secret' },
      { headers: { 'x-forwarded-for': '5.6.7.8' }, socket: {} } as any,
    );

    expect(result.requiresOtp).toBe(true);
    expect('message' in result && result.message).toBeDefined();
  });

  it('throws on invalid credentials', async () => {
    (authService as any).validateUserByEmail.mockResolvedValue(null);

    await expect(
      controller.login({ email: 'a@b.com', password: 'bad' }, {} as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verify-login-otp returns token', async () => {
    (authService as any).verifyLoginOtp.mockResolvedValue({
      access_token: 'token',
      user: { id: 'u1', email: 'a@b.com' },
    });

    const result = await controller.verifyLoginOtp(
      { email: 'a@b.com', otp: '123456' },
      { headers: {}, socket: {} } as any,
    );

    expect(result.access_token).toBe('token');
    expect(authService.verifyLoginOtp).toHaveBeenCalledWith('a@b.com', '123456', '127.0.0.1');
  });

  it('signup without SMTP creates user and returns token', async () => {
    (mailService as any).isConfigured.mockReturnValue(false);
    (authService as any).createUser.mockResolvedValue({ id: 'u1' });
    (authService as any).login.mockResolvedValue({ access_token: 'token', user: {} });

    const result = await controller.signup(
      { email: 'a@b.com', name: 'A', password: 'secret123' },
      { headers: {}, socket: {} } as any,
    );

    expect('access_token' in result && result.access_token).toBe('token');
    expect(authService.createUser).toHaveBeenCalledWith('a@b.com', 'A', 'secret123', '127.0.0.1');
  });

  it('signup with SMTP returns requiresOtp', async () => {
    (mailService as any).isConfigured.mockReturnValue(true);
    (authService as any).signupWithOtp.mockResolvedValue({
      requiresOtp: true,
      message: 'OTP sent to your email.',
    });

    const result = await controller.signup(
      { email: 'a@b.com', name: 'A', password: 'secret123' },
      { headers: {}, socket: {} } as any,
    );

    expect('requiresOtp' in result && result.requiresOtp).toBe(true);
    expect(authService.signupWithOtp).toHaveBeenCalledWith('a@b.com', 'A', 'secret123', '127.0.0.1');
  });

  it('verify-signup-otp returns token', async () => {
    (authService as any).verifySignupOtp.mockResolvedValue({
      access_token: 'token',
      user: { id: 'u1' },
    });

    const result = await controller.verifySignupOtp(
      { email: 'a@b.com', otp: '123456' },
      { headers: {}, socket: {} } as any,
    );

    expect('access_token' in result && result.access_token).toBe('token');
    expect(authService.verifySignupOtp).toHaveBeenCalledWith('a@b.com', '123456', '127.0.0.1');
  });

  it('forgot-password returns message', async () => {
    (authService as any).forgotPassword.mockResolvedValue({
      message: 'If an account exists with this email, you will receive a password reset link.',
    });

    const result = await controller.forgotPassword({ email: 'a@b.com' });

    expect(result.message).toBeDefined();
  });

  it('forgot-password throws when email missing', async () => {
    await expect(controller.forgotPassword({ email: '' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reset-password returns message', async () => {
    (authService as any).resetPassword.mockResolvedValue({
      message: 'Password has been reset. You can now log in.',
    });

    const result = await controller.resetPassword({
      token: 'abc123',
      password: 'newpass123',
    });

    expect(result.message).toContain('reset');
  });

  it('reset-password throws when token missing', async () => {
    await expect(
      controller.resetPassword({ token: '', password: 'newpass123' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns profile info', async () => {
    (authService as any).getUserById.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'A',
      avatarUrl: null,
      role: 'user',
      googleId: null,
    });

    const result = await controller.getProfile({ user: { id: 'u1' } } as any);

    expect(result.email).toBe('a@b.com');
  });

  it('updates settings', async () => {
    (authService as any).updateUserSettings.mockResolvedValue({ id: 'u1' });

    const result = await controller.updateSettings(
      { user: { id: 'u1' } } as any,
      { email: 'new@b.com' },
    );

    expect(result.id).toBe('u1');
    expect(authService.updateUserSettings).toHaveBeenCalledWith('u1', { email: 'new@b.com' });
  });
});
