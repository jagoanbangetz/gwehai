import { MailService } from '../../src/mail/mail.service';

describe('MailService', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'].forEach((k) => {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    });
  });

  afterEach(() => {
    Object.entries(savedEnv).forEach(([k, v]) => {
      if (v !== undefined) process.env[k] = v;
    });
  });

  it('is not configured when SMTP env vars are missing', () => {
    const service = new MailService();
    expect(service.isConfigured()).toBe(false);
  });

  it('is configured when SMTP env vars are set', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    const service = new MailService();
    expect(service.isConfigured()).toBe(true);
  });

  it('send returns false when not configured', async () => {
    const service = new MailService();
    const result = await service.send({
      to: 'test@example.com',
      subject: 'Test',
      text: 'Body',
    });
    expect(result).toBe(false);
  });

  it('sendOtp returns false when not configured', async () => {
    const service = new MailService();
    const result = await service.sendOtp('test@example.com', '123456', 'login');
    expect(result).toBe(false);
  });

  it('sendPasswordResetLink returns false when not configured', async () => {
    const service = new MailService();
    const result = await service.sendPasswordResetLink(
      'test@example.com',
      'https://app.example.com/reset?token=abc',
    );
    expect(result).toBe(false);
  });
});
