import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/** Logo URL for email header: LOGO_URL env, or FRONTEND_URL/logo.png (system logo in frontend/public) */
function getLogoUrl(): string {
  const url = process.env.LOGO_URL?.trim();
  if (url) return url;
  const base = process.env.FRONTEND_URL?.trim();
  if (base) return base.replace(/\/$/, '') + '/logo.png';
  return '';
}

/** Cursor-style email wrapper: dark header with system logo, clean typography, footer */
function emailLayout(title: string, bodyHtml: string, appName = 'GwehAI'): string {
  const logoUrl = getLogoUrl();
  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="${appName}" width="48" height="48" style="display:block;border-radius:10px;object-fit:contain;" />`
    : `<div style="width:48px;height:48px;background:#2a2a2a;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:#fff;">G</div>`;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;color:#e5e5e5;line-height:1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0d0d0d;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" style="max-width:520px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 24px;border-bottom:1px solid #2a2a2a;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="display:inline-flex;align-items:center;gap:12px;">
                      ${logoBlock}
                      <span style="font-size:20px;font-weight:600;color:#fff;letter-spacing:-0.02em;">${appName}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #2a2a2a;">
              <p style="margin:0;font-size:12px;color:#737373;">This is an automated message from ${appName}. Do not reply to this email.</p>
              <p style="margin:8px 0 0;font-size:12px;color:#525252;">&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

@Injectable()
export class MailService {
  private transporter: Transporter | null = null;
  private readonly appName = process.env.APP_NAME?.trim() || 'GwehAI';

  constructor() {
    const host = process.env.SMTP_HOST?.trim();
    const port = process.env.SMTP_PORT?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(port, 10) || 587,
        secure: port === '465',
        auth: { user, pass },
      });
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async send(options: SendMailOptions): Promise<boolean> {
    if (!this.transporter) return false;
    const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || 'noreply@localhost';
    await this.transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text ?? options.html?.replace(/<[^>]*>/g, '') ?? '',
      html: options.html,
    });
    return true;
  }

  /** Login from different device: OTP only */
  async sendOtp(to: string, otp: string, purpose: 'login' | 'signup'): Promise<boolean> {
    const subject = purpose === 'login'
      ? 'Your login verification code'
      : 'Verify your email address';
    const bodyHtml = purpose === 'login'
      ? `
        <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#fff;">Login verification code</h2>
        <p style="margin:0 0 24px;font-size:15px;color:#a3a3a3;">You're signing in from a new device or location. Enter this code to complete login:</p>
        <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:8px;padding:20px 24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:28px;font-weight:700;letter-spacing:0.2em;color:#fff;">${otp}</span>
        </div>
        <p style="margin:0;font-size:13px;color:#737373;">This code expires in 5 minutes. Do not share it with anyone.</p>
      `
      : `
        <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#fff;">Verify your email</h2>
        <p style="margin:0 0 24px;font-size:15px;color:#a3a3a3;">Enter this code on the signup page to complete your registration:</p>
        <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:8px;padding:20px 24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:28px;font-weight:700;letter-spacing:0.2em;color:#fff;">${otp}</span>
        </div>
        <p style="margin:0;font-size:13px;color:#737373;">This code expires in 5 minutes. Do not share it with anyone.</p>
      `;
    const html = emailLayout(subject, bodyHtml, this.appName);
    const text = `Your verification code is: ${otp}. It expires in 5 minutes. Do not share this code.`;
    return this.send({ to, subject, text, html });
  }

  /** Register: verification link + optional OTP in same email */
  async sendSignupVerification(to: string, verifyLink: string, otp: string): Promise<boolean> {
    const subject = 'Verify your email address';
    const bodyHtml = `
      <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#fff;">Verify your email address</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#a3a3a3;">Click the button below to verify your email and complete registration:</p>
      <p style="margin:0 0 24px;">
        <a href="${verifyLink}" style="display:inline-block;background:#fff;color:#0d0d0d;text-decoration:none;font-weight:600;font-size:14px;padding:14px 28px;border-radius:8px;">Verify email address</a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;color:#737373;">Or enter this code on the signup page:</p>
      <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:8px;padding:16px 24px;text-align:center;margin-bottom:24px;">
        <span style="font-size:24px;font-weight:700;letter-spacing:0.2em;color:#fff;">${otp}</span>
      </div>
      <p style="margin:0;font-size:13px;color:#737373;">This link and code expire in 5 minutes. Do not share them with anyone.</p>
    `;
    const html = emailLayout(subject, bodyHtml, this.appName);
    const text = `Verify your email: ${verifyLink}\nOr use this code: ${otp}. Expires in 5 minutes.`;
    return this.send({ to, subject, text, html });
  }

  /** Promotion / broadcast: custom subject and HTML body, wrapped in app layout */
  async sendPromotionEmail(to: string, subject: string, bodyHtml: string): Promise<boolean> {
    const html = emailLayout(subject, bodyHtml, this.appName);
    const text = bodyHtml.replace(/<[^>]*>/g, '').trim().slice(0, 2000);
    return this.send({ to, subject, text, html });
  }

  /** Reset password: link only */
  async sendPasswordResetLink(to: string, resetLink: string): Promise<boolean> {
    const subject = 'Reset your password';
    const bodyHtml = `
      <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#fff;">Reset your password</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#a3a3a3;">We received a request to reset your password. Click the button below to set a new password:</p>
      <p style="margin:0 0 24px;">
        <a href="${resetLink}" style="display:inline-block;background:#fff;color:#0d0d0d;text-decoration:none;font-weight:600;font-size:14px;padding:14px 28px;border-radius:8px;">Reset password</a>
      </p>
      <p style="margin:0;font-size:13px;color:#737373;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `;
    const html = emailLayout(subject, bodyHtml, this.appName);
    const text = `Reset your password: ${resetLink}\nThis link expires in 1 hour.`;
    return this.send({ to, subject, text, html });
  }
}
