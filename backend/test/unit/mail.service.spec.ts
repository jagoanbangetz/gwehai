import { MailService } from '../../src/mail/mail.service';

const EMAIL_LOGO_CDN = 'https://cdn.gweh.sh/logo.png';

const sendMailMock = jest.fn().mockResolvedValue(undefined);
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: sendMailMock }),
}));

describe('MailService', () => {
  const savedEnv: Record<string, string | undefined> = {};

  function saveEnv(keys: string[]) {
    keys.forEach((k) => {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    });
  }

  function restoreEnv() {
    Object.entries(savedEnv).forEach(([k, v]) => {
      if (v !== undefined) process.env[k] = v;
    });
  }

  beforeEach(() => {
    sendMailMock.mockClear();
    saveEnv(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'LOGO_URL']);
  });

  afterEach(() => {
    restoreEnv();
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

  describe('email logo (CDN) in all email types', () => {
    function configureSmtp() {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';
    }

    function lastSentHtml(): string {
      expect(sendMailMock).toHaveBeenCalled();
      const call = sendMailMock.mock.calls[sendMailMock.mock.calls.length - 1];
      const opts = call[0];
      expect(opts).toHaveProperty('html');
      return opts.html as string;
    }

    it('sendOtp (login) HTML contains CDN logo img', async () => {
      configureSmtp();
      const service = new MailService();
      await service.sendOtp('u@example.com', '123456', 'login');
      const html = lastSentHtml();
      expect(html).toContain(EMAIL_LOGO_CDN);
      expect(html).toMatch(new RegExp(`<img[^>]*src="${EMAIL_LOGO_CDN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 's'));
    });

    it('sendOtp (signup) HTML contains CDN logo img', async () => {
      configureSmtp();
      const service = new MailService();
      await service.sendOtp('u@example.com', '654321', 'signup');
      const html = lastSentHtml();
      expect(html).toContain(EMAIL_LOGO_CDN);
    });

    it('sendSignupVerification HTML contains CDN logo img', async () => {
      configureSmtp();
      const service = new MailService();
      await service.sendSignupVerification(
        'u@example.com',
        'https://app.example.com/verify?t=1',
        '999888',
      );
      const html = lastSentHtml();
      expect(html).toContain(EMAIL_LOGO_CDN);
      expect(html).toMatch(new RegExp(`<img[^>]*src="${EMAIL_LOGO_CDN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 's'));
    });

    it('sendPasswordResetLink HTML contains CDN logo img', async () => {
      configureSmtp();
      const service = new MailService();
      await service.sendPasswordResetLink('u@example.com', 'https://app.example.com/reset?t=1');
      const html = lastSentHtml();
      expect(html).toContain(EMAIL_LOGO_CDN);
    });

    it('sendPromotionEmail HTML contains CDN logo img', async () => {
      configureSmtp();
      const service = new MailService();
      await service.sendPromotionEmail(
        'u@example.com',
        'Promo',
        '<p>Hello</p>',
      );
      const html = lastSentHtml();
      expect(html).toContain(EMAIL_LOGO_CDN);
    });

    it('when LOGO_URL is set, HTML uses that URL instead of CDN', async () => {
      configureSmtp();
      process.env.LOGO_URL = 'https://custom.example.com/logo.png';
      const service = new MailService();
      await service.sendOtp('u@example.com', '123456', 'login');
      const html = lastSentHtml();
      expect(html).toContain('https://custom.example.com/logo.png');
      expect(html).not.toContain(EMAIL_LOGO_CDN);
    });
  });
});
