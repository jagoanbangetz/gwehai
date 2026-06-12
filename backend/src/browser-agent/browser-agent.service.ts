/**
 * Browser Agent Service
 *
 * Playwright-based headless browser automation for authenticated scanning.
 * Supports: auto-login, auth state capture, form interaction, screenshots.
 * Safety: rate-limited, in-scope only, no file downloads.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs/promises';

/** Max retries for browser launch before giving up. */
const BROWSER_LAUNCH_MAX_RETRIES = 3;
/** Delay between browser launch retries (ms). */
const BROWSER_LAUNCH_RETRY_DELAY_MS = 2000;

/** Thrown when Playwright browser fails to launch after all retries. */
export class BrowserLaunchError extends Error {
  constructor(message: string, public readonly attempts: number) {
    super(message);
    this.name = 'BrowserLaunchError';
  }
}

// Dynamic import for playwright (may not be installed in all envs)
let playwright: typeof import('playwright') | null = null;

async function getPlaywright() {
  if (!playwright) {
    playwright = await import('playwright');
  }
  return playwright;
}

/** Auth state captured after login */
export interface AuthState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: string;
  }>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  headers: Record<string, string>;
  tokens: {
    cookies: string;
    bearer?: string;
    customHeaders: Record<string, string>;
  };
  finalUrl: string;
  storageState?: any;
}

/** Form field detected on page */
export interface FormField {
  name: string;
  type: string;
  id?: string;
  placeholder?: string;
  value?: string;
  required: boolean;
  options?: Array<{ value: string; text: string }>;
}

/** Form detected on page */
export interface DetectedForm {
  index: number;
  action: string;
  method: string;
  enctype: string;
  inputs: FormField[];
  hasCsrfToken: boolean;
  csrfTokenField?: string;
}

/** Page analysis result */
export interface PageAnalysis {
  url: string;
  finalUrl: string;
  title: string;
  forms: DetectedForm[];
  links: Array<{ href: string; text: string; sameOrigin: boolean }>;
  cookies: Array<{ name: string; domain: string; path: string; httpOnly: boolean; secure: boolean }>;
  inputs: Array<{ name: string; type: string; id?: string; selector: string }>;
  screenshots?: string[];
}

/** Browser action result */
export interface BrowserActionResult {
  success: boolean;
  action: string;
  url?: string;
  finalUrl?: string;
  data?: any;
  screenshot?: string;
  error?: string;
  authState?: AuthState;
  pageAnalysis?: PageAnalysis;
}

/** Session state per conversation */
interface BrowserSession {
  browser: any;
  context: any;
  page: any;
  authState: AuthState | null;
  scope: string[];
  lastAction: number;
  screenshots: string[];
}

@Injectable()
export class BrowserAgentService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserAgentService.name);
  private sessions = new Map<string, BrowserSession>();
  private readonly rateLimitMs = 1000; // 1 req/sec
  private readonly screenshotDir: string;
  private readonly maxSessionAge = 30 * 60 * 1000; // 30 min

  constructor(private readonly configService: ConfigService) {
    const workspace = this.configService.get<string>('PENTEST_WORKSPACE') || '/tmp/gwehai-browser';
    this.screenshotDir = path.join(workspace, 'screenshots');
  }

  async onModuleDestroy() {
    await this.closeAllSessions();
  }

  // ─── Session Management ─────────────────────────────────────────────

  private async getOrCreateSession(
    conversationId: string,
    scope: string[] = [],
  ): Promise<BrowserSession> {
    let session = this.sessions.get(conversationId);
    if (session) {
      // Check if session is too old
      if (Date.now() - session.lastAction > this.maxSessionAge) {
        await this.closeSession(conversationId);
        session = undefined;
      }
    }

    if (!session) {
      const pw = await getPlaywright();
      let browser: any;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= BROWSER_LAUNCH_MAX_RETRIES; attempt++) {
        try {
          browser = await pw.chromium.launch({
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium',
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
              '--disable-web-security',
              '--disable-features=VizDisplayCompositor',
            ],
          });
          lastError = null;
          break; // success
        } catch (err) {
          lastError = err as Error;
          this.logger.warn(
            `Browser launch attempt ${attempt}/${BROWSER_LAUNCH_MAX_RETRIES} failed: ${lastError.message}`,
          );
          if (attempt < BROWSER_LAUNCH_MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BROWSER_LAUNCH_RETRY_DELAY_MS));
          }
        }
      }

      if (!browser) {
        const errMsg = `Browser launch failed after ${BROWSER_LAUNCH_MAX_RETRIES} attempts: ${lastError?.message || 'unknown error'}`;
        this.logger.warn(errMsg);
        throw new BrowserLaunchError(errMsg, BROWSER_LAUNCH_MAX_RETRIES);
      }

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
      });

      // Block file downloads for safety
      context.on('download', (download) => {
        this.logger.warn(`Download blocked: ${download.suggestedFilename()}`);
        download.cancel();
      });

      const page = await context.newPage();

      session = {
        browser,
        context,
        page,
        authState: null,
        scope,
        lastAction: Date.now(),
        screenshots: [],
      };
      this.sessions.set(conversationId, session);
      this.logger.log(`Browser session created for conversation ${conversationId}`);
    }

    return session;
  }

  async closeSession(conversationId: string): Promise<void> {
    const session = this.sessions.get(conversationId);
    if (session) {
      try {
        await session.context?.close().catch(() => {});
        await session.browser?.close().catch(() => {});
      } catch (e) {
        this.logger.warn(`Error closing session: ${(e as Error).message}`);
      }
      this.sessions.delete(conversationId);
      this.logger.log(`Browser session closed for conversation ${conversationId}`);
    }
  }

  async closeAllSessions(): Promise<void> {
    for (const [id] of this.sessions) {
      await this.closeSession(id);
    }
  }

  // ─── Rate Limiting ──────────────────────────────────────────────────

  private async enforceRateLimit(session: BrowserSession): Promise<void> {
    const elapsed = Date.now() - session.lastAction;
    if (elapsed < this.rateLimitMs) {
      await new Promise((r) => setTimeout(r, this.rateLimitMs - elapsed));
    }
    session.lastAction = Date.now();
  }

  // ─── Scope Validation ───────────────────────────────────────────────

  private isUrlInScope(url: string, scope: string[]): boolean {
    if (scope.length === 0) return true; // No scope restriction
    try {
      const urlObj = new URL(url);
      return scope.some((s) => {
        // Match exact host or wildcard subdomain
        if (s.startsWith('*.')) {
          const domain = s.slice(2);
          return urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain);
        }
        return urlObj.hostname === s || urlObj.hostname.endsWith('.' + s);
      });
    } catch {
      return false;
    }
  }

  // ─── Screenshot Capture ─────────────────────────────────────────────

  private async captureScreenshot(
    page: any,
    conversationId: string,
    label: string,
  ): Promise<string> {
    await fs.mkdir(this.screenshotDir, { recursive: true });
    const filename = `${conversationId}_${label}_${Date.now()}.png`;
    const filepath = path.join(this.screenshotDir, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    this.logger.log(`Screenshot saved: ${filepath}`);
    return filepath;
  }

  // ─── Core Browser Actions ───────────────────────────────────────────

  /**
   * Navigate to a URL.
   */
  async navigate(
    conversationId: string,
    url: string,
    options: { scope?: string[]; waitForSelector?: string; timeout?: number } = {},
  ): Promise<BrowserActionResult> {
    try {
      const session = await this.getOrCreateSession(conversationId, options.scope);

      if (!this.isUrlInScope(url, session.scope)) {
        return { success: false, action: 'navigate', error: `URL out of scope: ${url}`, url };
      }

      await this.enforceRateLimit(session);
      const timeout = options.timeout || 30000;
      await session.page.goto(url, { waitUntil: 'networkidle', timeout });

      if (options.waitForSelector) {
        await session.page.waitForSelector(options.waitForSelector, { timeout: 10000 }).catch(() => {});
      }

      const screenshot = await this.captureScreenshot(session.page, conversationId, 'navigate');
      const analysis = await this.analyzePage(session);

      return {
        success: true,
        action: 'navigate',
        url,
        finalUrl: session.page.url(),
        screenshot,
        pageAnalysis: analysis,
      };
    } catch (e) {
      return { success: false, action: 'navigate', error: (e as Error).message, url };
    }
  }

  /**
   * Auto-login: detect login form, fill credentials, submit, capture auth state.
   */
  async autoLogin(
    conversationId: string,
    loginUrl: string,
    username: string,
    password: string,
    options: { scope?: string[]; usernameSelector?: string; passwordSelector?: string; submitSelector?: string } = {},
  ): Promise<BrowserActionResult> {
    try {
      const session = await this.getOrCreateSession(conversationId, options.scope);

      if (!this.isUrlInScope(loginUrl, session.scope)) {
        return { success: false, action: 'auto_login', error: `URL out of scope: ${loginUrl}`, url: loginUrl };
      }

      await this.enforceRateLimit(session);

      // Navigate to login page
      await session.page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });
      const screenshotBefore = await this.captureScreenshot(session.page, conversationId, 'login_before');

      // Detect or use provided selectors
      const passwordSelector = options.passwordSelector || 'input[type="password"]';
      const passwordField = await session.page.$(passwordSelector);

      if (!passwordField) {
        const analysis = await this.analyzePage(session);
        return {
          success: false,
          action: 'auto_login',
          error: 'No password field found on page',
          url: loginUrl,
          screenshot: screenshotBefore,
          pageAnalysis: analysis,
        };
      }

      // Find username field
      let usernameSelector = options.usernameSelector;
      if (!usernameSelector) {
        usernameSelector = await session.page.evaluate((passSel: string) => {
          const pass = document.querySelector(passSel);
          if (!pass || !(pass as HTMLInputElement).form) return 'input[type="text"]';
          const form = (pass as HTMLInputElement).form!;
          const textInputs = form.querySelectorAll('input[type="text"], input[type="email"], input:not([type]), input[type=""]');
          for (const input of Array.from(textInputs)) {
            const el = input as HTMLInputElement;
            if (el.name && /user|login|email|name|account/i.test(el.name)) return `[name="${el.name}"]`;
            if (el.id && /user|login|email|name|account/i.test(el.id)) return `#${el.id}`;
          }
          return textInputs[0] ? `input[name="${(textInputs[0] as HTMLInputElement).name}"]` : 'input[type="text"]';
        }, passwordSelector);
      }

      // Fill credentials
      await session.page.fill(usernameSelector, username);
      await session.page.fill(passwordSelector, password);

      // Submit form
      const submitSelector = options.submitSelector || [
        'button[type="submit"]',
        'input[type="submit"]',
        'input[type="image"]',
        'button:not([type="button"])',
        '[role="button"]',
      ].join(', ');

      const submitBtn = await session.page.$(submitSelector);
      if (submitBtn) {
        await Promise.all([
          session.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
          submitBtn.click(),
        ]);
      } else {
        await session.page.keyboard.press('Enter');
        await session.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      }

      // Wait a bit for any post-login redirects
      await new Promise((r) => setTimeout(r, 2000));

      const screenshotAfter = await this.captureScreenshot(session.page, conversationId, 'login_after');

      // Capture auth state
      const authState = await this.captureAuthState(session);
      session.authState = authState;

      const analysis = await this.analyzePage(session);

      return {
        success: true,
        action: 'auto_login',
        url: loginUrl,
        finalUrl: session.page.url(),
        screenshot: screenshotAfter,
        authState,
        pageAnalysis: analysis,
        data: {
          loginUrl,
          finalUrl: session.page.url(),
          cookiesCount: authState.cookies.length,
          hasBearerToken: !!authState.tokens.bearer,
          screenshotBefore,
          screenshotAfter,
        },
      };
    } catch (e) {
      return { success: false, action: 'auto_login', error: (e as Error).message, url: loginUrl };
    }
  }

  /**
   * Click an element on the page.
   */
  async click(
    conversationId: string,
    selector: string,
    options: { scope?: string[]; waitForNavigation?: boolean } = {},
  ): Promise<BrowserActionResult> {
    try {
      const session = await this.getOrCreateSession(conversationId, options.scope);
      await this.enforceRateLimit(session);

      if (options.waitForNavigation) {
        await Promise.all([
          session.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          session.page.click(selector, { timeout: 10000 }),
        ]);
      } else {
        await session.page.click(selector, { timeout: 10000 });
        await new Promise((r) => setTimeout(r, 1000)); // Wait for any JS effects
      }

      const screenshot = await this.captureScreenshot(session.page, conversationId, 'click');
      const analysis = await this.analyzePage(session);

      return {
        success: true,
        action: 'click',
        finalUrl: session.page.url(),
        screenshot,
        pageAnalysis: analysis,
        data: { selector, finalUrl: session.page.url() },
      };
    } catch (e) {
      return { success: false, action: 'click', error: (e as Error).message, data: { selector } };
    }
  }

  /**
   * Type text into a field.
   */
  async type(
    conversationId: string,
    selector: string,
    value: string,
    options: { scope?: string[]; delay?: number; clear?: boolean } = {},
  ): Promise<BrowserActionResult> {
    try {
      const session = await this.getOrCreateSession(conversationId, options.scope);
      await this.enforceRateLimit(session);

      if (options.clear !== false) {
        await session.page.fill(selector, '');
      }
      await session.page.type(selector, value, { delay: options.delay || 50 });

      const screenshot = await this.captureScreenshot(session.page, conversationId, 'type');

      return {
        success: true,
        action: 'type',
        finalUrl: session.page.url(),
        screenshot,
        data: { selector, value: value.substring(0, 50) + (value.length > 50 ? '...' : '') },
      };
    } catch (e) {
      return { success: false, action: 'type', error: (e as Error).message, data: { selector } };
    }
  }

  /**
   * Extract content from the page (text, HTML, or specific selector).
   */
  async extract(
    conversationId: string,
    options: { selector?: string; attribute?: string; scope?: string[] } = {},
  ): Promise<BrowserActionResult> {
    try {
      const session = await this.getOrCreateSession(conversationId, options.scope);
      await this.enforceRateLimit(session);

      let data: any;
      if (options.selector) {
        const elements = await session.page.$$(options.selector);
        data = await Promise.all(
          elements.map(async (el: any) => {
            if (options.attribute) {
              return await el.getAttribute(options.attribute);
            }
            return await el.textContent();
          }),
        );
      } else {
        data = {
          title: await session.page.title(),
          url: session.page.url(),
          text: (await session.page.textContent('body'))?.substring(0, 5000),
        };
      }

      return {
        success: true,
        action: 'extract',
        finalUrl: session.page.url(),
        data,
      };
    } catch (e) {
      return { success: false, action: 'extract', error: (e as Error).message };
    }
  }

  /**
   * Take a screenshot of the current page.
   */
  async screenshot(
    conversationId: string,
    options: { fullPage?: boolean; scope?: string[] } = {},
  ): Promise<BrowserActionResult> {
    try {
      const session = await this.getOrCreateSession(conversationId, options.scope);
      const screenshot = await this.captureScreenshot(session.page, conversationId, 'manual');

      return {
        success: true,
        action: 'screenshot',
        finalUrl: session.page.url(),
        screenshot,
      };
    } catch (e) {
      return { success: false, action: 'screenshot', error: (e as Error).message };
    }
  }

  /**
   * Analyze page: detect forms, links, inputs, CSRF tokens.
   */
  async analyzePage(session?: BrowserSession, conversationId?: string): Promise<PageAnalysis> {
    if (!session && conversationId) {
      session = this.sessions.get(conversationId);
    }
    if (!session) {
      throw new Error('No active browser session');
    }

    const page = session.page;
    const pageUrl = page.url();

    // Extract forms with CSRF detection
    const forms: DetectedForm[] = await page.evaluate((pUrl: string) => {
      const base = new URL(pUrl);
      const results: any[] = [];
      document.querySelectorAll('form').forEach((form, idx) => {
        const action = form.action || base.origin + base.pathname;
        const method = (form.method || 'GET').toUpperCase();
        const inputs: any[] = [];
        let hasCsrfToken = false;
        let csrfTokenField: string | undefined;

        form.querySelectorAll('input, select, textarea').forEach((el) => {
          const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          const name = (input as any).name || (input as any).id;
          if (!name) return;

          const field: any = {
            name,
            type: ((input as any).type || input.tagName.toLowerCase()).toLowerCase(),
            id: (input as any).id || null,
            placeholder: (input as any).placeholder || null,
            required: (input as any).required || false,
          };

          // Detect CSRF tokens
          if (name.toLowerCase().includes('csrf') || name.toLowerCase().includes('token') ||
              name.toLowerCase().includes('_token') || name.toLowerCase().includes('nonce') ||
              (input as any).value?.length > 10) {
            hasCsrfToken = true;
            csrfTokenField = name;
          }

          if (input.tagName.toLowerCase() === 'select') {
            field.options = Array.from((input as HTMLSelectElement).options).map((o) => ({
              value: o.value,
              text: o.text.trim(),
            }));
          } else if (field.type !== 'password' && field.type !== 'submit' && field.type !== 'image') {
            if ((input as any).value != null) field.value = String((input as any).value).substring(0, 200);
          }

          if (field.type !== 'submit' && field.type !== 'button' && field.type !== 'image') {
            inputs.push(field);
          }
        });

        results.push({
          index: idx,
          action: action.startsWith('http') ? action : new URL(action, pUrl).href,
          method,
          enctype: form.enctype || 'application/x-www-form-urlencoded',
          inputs,
          hasCsrfToken,
          csrfTokenField,
        });
      });
      return results;
    }, pageUrl);

    // Extract links
    const links = await page.evaluate((pUrl: string) => {
      const base = new URL(pUrl);
      const results: any[] = [];
      document.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        try {
          const full = new URL(href, pUrl).href;
          const sameOrigin = new URL(full).origin === base.origin;
          results.push({
            href: full,
            text: (a.textContent || '').trim().substring(0, 100),
            sameOrigin,
          });
        } catch {}
      });
      return results;
    }, pageUrl);

    // Extract standalone inputs (not in forms)
    const inputs = await page.evaluate(() => {
      const results: any[] = [];
      document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"])').forEach((el) => {
        const input = el as HTMLInputElement;
        if (!input.closest('form')) {
          results.push({
            name: input.name || input.id || '',
            type: input.type || 'text',
            id: input.id || undefined,
            selector: input.name ? `input[name="${input.name}"]` : input.id ? `#${input.id}` : '',
          });
        }
      });
      return results;
    });

    const cookies = await session.context.cookies();

    return {
      url: pageUrl,
      finalUrl: pageUrl,
      title: await page.title(),
      forms,
      links: links.map((l: any) => ({
        href: l.href,
        text: l.text,
        sameOrigin: l.sameOrigin,
      })),
      cookies: cookies.map((c) => ({
        name: c.name,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
      })),
      inputs,
    };
  }

  /**
   * Get current auth state from session.
   */
  async getAuthState(conversationId: string): Promise<BrowserActionResult> {
    const session = this.sessions.get(conversationId);
    if (!session) {
      return { success: false, action: 'get_auth_state', error: 'No active browser session' };
    }

    const authState = await this.captureAuthState(session);
    session.authState = authState;

    return {
      success: true,
      action: 'get_auth_state',
      authState,
      finalUrl: session.page.url(),
    };
  }

  /**
   * Set auth state on a session (e.g., from stored credentials).
   */
  async setAuthState(
    conversationId: string,
    authState: Partial<AuthState>,
    scope: string[] = [],
  ): Promise<BrowserActionResult> {
    try {
      const session = await this.getOrCreateSession(conversationId, scope);

      if (authState.cookies) {
        await session.context.addCookies(authState.cookies as any);
      }

      if (authState.headers) {
        await session.context.setExtraHTTPHeaders(authState.headers);
      }

      session.authState = authState as AuthState;

      return {
        success: true,
        action: 'set_auth_state',
        data: { cookiesCount: authState.cookies?.length || 0 },
      };
    } catch (e) {
      return { success: false, action: 'set_auth_state', error: (e as Error).message };
    }
  }

  /**
   * Save auth state to storageState file for reuse.
   */
  async saveStorageState(conversationId: string): Promise<BrowserActionResult> {
    try {
      const session = this.sessions.get(conversationId);
      if (!session) {
        return { success: false, action: 'save_storage_state', error: 'No active browser session' };
      }

      const stateDir = path.join(this.screenshotDir, 'auth-states');
      await fs.mkdir(stateDir, { recursive: true });
      const statePath = path.join(stateDir, `${conversationId}_state.json`);

      const storageState = await session.context.storageState();
      await fs.writeFile(statePath, JSON.stringify(storageState, null, 2));

      return {
        success: true,
        action: 'save_storage_state',
        data: { path: statePath, cookiesCount: storageState.cookies.length },
      };
    } catch (e) {
      return { success: false, action: 'save_storage_state', error: (e as Error).message };
    }
  }

  /**
   * Load auth state from a storageState file.
   */
  async loadStorageState(conversationId: string, statePath: string): Promise<BrowserActionResult> {
    try {
      const session = await this.getOrCreateSession(conversationId);
      const stateData = await fs.readFile(statePath, 'utf-8');
      const storageState = JSON.parse(stateData);

      // Close old context and create new one with loaded state
      await session.context.close().catch(() => {});
      const pw = await getPlaywright();
      let browser: any;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= BROWSER_LAUNCH_MAX_RETRIES; attempt++) {
        try {
          browser = await pw.chromium.launch({
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium',
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          });
          lastError = null;
          break;
        } catch (err) {
          lastError = err as Error;
          this.logger.warn(
            `Browser launch (loadStorageState) attempt ${attempt}/${BROWSER_LAUNCH_MAX_RETRIES} failed: ${lastError.message}`,
          );
          if (attempt < BROWSER_LAUNCH_MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BROWSER_LAUNCH_RETRY_DELAY_MS));
          }
        }
      }

      if (!browser) {
        const errMsg = `Browser launch failed after ${BROWSER_LAUNCH_MAX_RETRIES} attempts: ${lastError?.message || 'unknown error'}`;
        this.logger.warn(errMsg);
        throw new BrowserLaunchError(errMsg, BROWSER_LAUNCH_MAX_RETRIES);
      }
      const context = await browser.newContext({
        storageState,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();

      // Update session with new browser, context, page
      session.browser = browser;
      session.context = context;
      session.page = page;

      return {
        success: true,
        action: 'load_storage_state',
        data: { path: statePath, cookiesCount: storageState.cookies.length },
      };
    } catch (e) {
      return { success: false, action: 'load_storage_state', error: (e as Error).message };
    }
  }

  // ─── Auth State Capture ─────────────────────────────────────────────

  private async captureAuthState(session: BrowserSession): Promise<AuthState> {
    const page = session.page;
    const cookies = await session.context.cookies();
    const finalUrl = page.url();

    // Extract localStorage and sessionStorage
    const localStorage: Record<string, string> = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)!;
        items[key] = window.localStorage.getItem(key) || '';
      }
      return items;
    });

    const sessionStorage: Record<string, string> = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i)!;
        items[key] = window.sessionStorage.getItem(key) || '';
      }
      return items;
    });

    // Build cookie string
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    // Try to find bearer tokens in localStorage/sessionStorage
    let bearer: string | undefined;
    const tokenKeys = ['token', 'access_token', 'jwt', 'auth_token', 'bearer', 'accessToken', 'jwtToken'];
    for (const key of tokenKeys) {
      const value = localStorage[key] || sessionStorage[key];
      if (value && value.length > 10) {
        bearer = value;
        break;
      }
    }

    // Check for JWT in cookies too
    if (!bearer) {
      for (const cookie of cookies) {
        if (cookie.value.startsWith('eyJ') && cookie.value.length > 50) {
          bearer = cookie.value;
          break;
        }
      }
    }

    // Build headers for authenticated requests
    const headers: Record<string, string> = {};
    if (bearer) {
      headers['Authorization'] = `Bearer ${bearer}`;
    }
    if (cookieStr) {
      headers['Cookie'] = cookieStr;
    }

    // Get storageState for Playwright context reuse
    let storageState: any;
    try {
      storageState = await session.context.storageState();
    } catch {}

    return {
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })),
      localStorage,
      sessionStorage,
      headers,
      tokens: {
        cookies: cookieStr,
        bearer,
        customHeaders: headers,
      },
      finalUrl,
      storageState,
    };
  }

  // ─── XSS/CSRF Testing Helpers ──────────────────────────────────────

  /**
   * Test reflected XSS via form submission.
   */
  async testReflectedXss(
    conversationId: string,
    formSelector: string,
    payload: string,
    options: { scope?: string[]; inputSelector?: string } = {},
  ): Promise<BrowserActionResult> {
    try {
      const session = await this.getOrCreateSession(conversationId, options.scope);
      await this.enforceRateLimit(session);

      const inputSelector = options.inputSelector || `${formSelector} input[type="text"]:first-of-type`;
      const input = await session.page.$(inputSelector);

      if (!input) {
        return { success: false, action: 'test_xss', error: `Input not found: ${inputSelector}` };
      }

      // Fill the payload
      await session.page.fill(inputSelector, payload);

      // Submit the form
      const submitBtn = await session.page.$(`${formSelector} [type="submit"], ${formSelector} button`);
      if (submitBtn) {
        await Promise.all([
          session.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          submitBtn.click(),
        ]);
      } else {
        await session.page.keyboard.press('Enter');
        await session.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      }

      // Check if payload is reflected in the page
      const pageContent = await session.page.content();
      const isReflected = pageContent.includes(payload);

      // Check if script executed (look for alert dialogs)
      let scriptExecuted = false;
      session.page.once('dialog', async (dialog: any) => {
        scriptExecuted = true;
        await dialog.dismiss();
      });

      const screenshot = await this.captureScreenshot(session.page, conversationId, 'xss_test');

      return {
        success: true,
        action: 'test_xss',
        finalUrl: session.page.url(),
        screenshot,
        data: {
          payload,
          isReflected,
          scriptExecuted,
          formSelector,
          inputSelector,
        },
      };
    } catch (e) {
      return { success: false, action: 'test_xss', error: (e as Error).message };
    }
  }

  /**
   * Check CSRF token presence in forms.
   */
  async checkCsrfTokens(conversationId: string, scope?: string[]): Promise<BrowserActionResult> {
    try {
      const session = this.sessions.get(conversationId);
      if (!session) {
        return { success: false, action: 'check_csrf', error: 'No active browser session' };
      }

      const analysis = await this.analyzePage(session);
      const csrfReport = analysis.forms.map((form) => ({
        formIndex: form.index,
        action: form.action,
        method: form.method,
        hasCsrfToken: form.hasCsrfToken,
        csrfTokenField: form.csrfTokenField,
        risk: form.method === 'POST' && !form.hasCsrfToken ? 'HIGH' : 'LOW',
      }));

      return {
        success: true,
        action: 'check_csrf',
        finalUrl: session.page.url(),
        data: {
          forms: csrfReport,
          highRiskForms: csrfReport.filter((f) => f.risk === 'HIGH'),
        },
      };
    } catch (e) {
      return { success: false, action: 'check_csrf', error: (e as Error).message };
    }
  }

  // ─── Utility ────────────────────────────────────────────────────────

  /**
   * Get list of active sessions.
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Check if a session exists.
   */
  hasSession(conversationId: string): boolean {
    return this.sessions.has(conversationId);
  }
}
