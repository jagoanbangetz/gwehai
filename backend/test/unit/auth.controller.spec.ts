import { BadRequestException } from '@nestjs/common';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';

describe('AuthController', () => {
  const authService = {
    validateUserByEmail: jest.fn(),
    login: jest.fn(),
    createUser: jest.fn(),
    updateUserSettings: jest.fn(),
    getUserById: jest.fn(),
  } as unknown as AuthService;

  let controller: AuthController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new AuthController(authService);
  });

  it('logs in with valid credentials', async () => {
    authService.validateUserByEmail = jest.fn().mockResolvedValue({ id: 'u1' });
    authService.login = jest.fn().mockResolvedValue({ access_token: 'token' });

    const result = await controller.login({ email: 'a@b.com', password: 'secret' });

    expect(result.access_token).toBe('token');
    expect(authService.validateUserByEmail).toHaveBeenCalled();
    expect(authService.login).toHaveBeenCalled();
  });

  it('throws on invalid credentials', async () => {
    authService.validateUserByEmail = jest.fn().mockResolvedValue(null);

    await expect(
      controller.login({ email: 'a@b.com', password: 'bad' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('signs up and logs in', async () => {
    authService.createUser = jest.fn().mockResolvedValue({ id: 'u1' });
    authService.login = jest.fn().mockResolvedValue({ access_token: 'token' });

    const result = await controller.signup({ email: 'a@b.com', name: 'A', password: 'secret123' });

    expect(result.access_token).toBe('token');
  });

  it('returns profile info', async () => {
    authService.getUserById = jest.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'A',
      avatarUrl: null,
      role: 'user',
      defaultLanguage: 'en',
      defaultModelId: null,
      googleId: null,
    });

    const result = await controller.getProfile({ user: { id: 'u1' } } as any);

    expect(result.email).toBe('a@b.com');
  });

  it('updates settings', async () => {
    authService.updateUserSettings = jest.fn().mockResolvedValue({ id: 'u1' });

    const result = await controller.updateSettings(
      { user: { id: 'u1' } } as any,
      { defaultLanguage: 'id' },
    );

    expect(result.id).toBe('u1');
    expect(authService.updateUserSettings).toHaveBeenCalledWith('u1', { defaultLanguage: 'id' });
  });
});
