/**
 * Research Browser Service
 *
 * SEPARATE headless browser for research/reference browsing.
 * NOT the same as BrowserAgentService (which is for pentest target scanning).
 *
 * Purpose: Agent can look up CVE details, read security blogs, verify techniques.
 * Safety: strict domain allowlist, no downloads, no form submission, 30s timeout,
 *         rate-limited to 5 research actions per session.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

// ─── Domain Allowlist ────────────────────────────────────────────────
// Only these domains (and their subdomains) are allowed for research browsing.
const RESEARCH_ALLOWLIST: ReadonlySet<string> = new Set([
  // CVE databases
  'cve.mitre.org',
  'nvd.nist.gov',
  'cve.circl.lu',
  'cvedetails.com',
  'vulners.com',
  'cve.org',
  // Exploit databases
  'exploit-db.com',
  'www.exploit-db.com',
  'github.com',  // for GHSA advisories and PoCs
  'gist.github.com',
  // Security advisories
  'security.snyk.io',
  'snyk.io',
  'security advisories.docker.com',
  // Security blogs & references
  'portswigger.net',
  'owasp.org',
  'cheatsheetseries.owasp.org',
  'book.hacktricks.xyz',
  'hacktricks.xyz',
  'gtfobins.github.io',
  'lolbas-project.github.io',
  'blog.cloudflare.com',
  'blog.detectify.com',
  'infosecwriteups.com',
  'medium.com',  // many security writeups
  // PHP/WordPress specific
  'php.net',
  'www.php.net',
  'wordpress.org',
  'wpscan.com',
  // Documentation
  'developer.mozilla.org',
  'docs.python.org',
  'nodejs.org',
  'learn.microsoft.com',
  // Nuclei templates reference
  'cloud.projectdiscovery.io',
  'projectdiscovery.io',
  // Search engines (for research_search results)
  'duckduckgo.com',
  'html.duckduckgo.com',
]);

// Max research actions per conversation session
const MAX_RESEARCH_PER_SESSION = 5;
// Timeout for page navigation (ms)
const NAVIGATION_TIMEOUT_MS = 30_000;
// Rate limit between requests (ms)
const RATE_LIMIT_MS = 1500;

/** Result of a research browse operation */
export interface ResearchBrowseResult {
  success: boolean;
  url: string;
  finalUrl?: string;
  title?: string;
  textContent?: string;
  /** Key headings extracted from the page */
  headings?: Array<{ level: string; text: string }>;
  /** Links extracted from the page (research-relevant) */
  links?: Array<{ href: string; text: string }>;
  /** CVE IDs found on the page */
  cveIds?: string[];
  screenshot?: string;
  error?: string;
}

/** A single search result */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Result of a research search operation */
export interface ResearchSearchResult {
  success: boolean;
  query: string;
  results: SearchResult[];
  totalResults: number;
  error?: string;
}

/** Per-session state */
interface ResearchSession {
  actionCount: number;
  lastActionAt: number;
}

@Injectable()
export class ResearchBrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(ResearchBrowserService.name);
  private sessions = new Map<string, ResearchSession>();

  // Playwright is loaded lazily (may not be installed)
  private playwright: typeof import('playwright') | null = null;
  private browser: any = null;
  private browserReady = false;

  async onModuleDestroy() {
    await this.closeBrowser();
  }

  // ─── Browser Lifecycle ─────────────────────────────────────────────

  private async getPlaywright() {
    if (!this.playwright) {
      this.playwright = await import('playwright');
    }
    return this.playwright;
  }

  private async ensureBrowser(): Promise<any> {
    if (this.browser && this.browserReady) {
      try {
        // Check if browser is still connected
        if (this.browser.isConnected()) return this.browser;
      } catch {
        this.browser = null;
        this.browserReady = false;
      }
    }

    const pw = await this.getPlaywright();
    try {
      this.browser = await pw.chromium.launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium',
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--no-zygote',
        ],
      });
      this.browserReady = true;
      this.logger.log('Research browser instance launched');
      return this.browser;
    } catch (err) {
      this.logger.error(`Failed to launch research browser: ${(err as Error).message}`);
      throw err;
    }
  }

  private async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close().catch(() => {});
      } catch {}
      this.browser = null;
      this.browserReady = false;
      this.logger.log('Research browser closed');
    }
  }

  // ─── Session Management ────────────────────────────────────────────

  private getSession(conversationId: string): ResearchSession {
    let session = this.sessions.get(conversationId);
    if (!session) {
      session = { actionCount: 0, lastActionAt: 0 };
      this.sessions.set(conversationId, session);
    }
    return session;
  }

  private checkRateLimit(session: ResearchSession): void {
    const elapsed = Date.now() - session.lastActionAt;
    if (elapsed < RATE_LIMIT_MS) {
      // Will be awaited by caller if needed
    }
  }

  private async enforceRateLimit(session: ResearchSession): Promise<void> {
    const elapsed = Date.now() - session.lastActionAt;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }
    session.lastActionAt = Date.now();
    session.actionCount++;
  }

  private checkQuota(session: ResearchSession): string | null {
    if (session.actionCount >= MAX_RESEARCH_PER_SESSION) {
      return `Research limit reached (${MAX_RESEARCH_PER_SESSION} per session). Use exec with curl for additional lookups.`;
    }
    return null;
  }

  // ─── Domain Validation ────────────────────────────────────────────

  private isAllowedDomain(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      // Check exact match or parent domain match
      if (RESEARCH_ALLOWLIST.has(hostname)) return true;
      // Check subdomain match (e.g. sub.cve.mitre.org)
      for (const domain of RESEARCH_ALLOWLIST) {
        if (hostname.endsWith('.' + domain)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ─── CVE Extraction ───────────────────────────────────────────────

  private extractCveIds(text: string): string[] {
    const matches = text.match(/CVE-\d{4}-\d{4,}/gi) || [];
    return [...new Set(matches.map((m) => m.toUpperCase()))];
  }

  // ─── Content Extraction ───────────────────────────────────────────

  private async extractPageContent(page: any): Promise<{
    title: string;
    textContent: string;
    headings: Array<{ level: string; text: string }>;
    links: Array<{ href: string; text: string }>;
    cveIds: string[];
  }> {
    const title = await page.title() || '';

    // Extract main text content, stripping scripts/styles
    const textContent = await page.evaluate(() => {
      // Remove script, style, nav, footer, header elements
      const removeSelectors = 'script, style, nav, footer, header, aside, .sidebar, .nav, .menu, .ad, .advertisement';
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(removeSelectors).forEach((el) => el.remove());
      return clone.innerText?.substring(0, 15000) || '';
    });

    // Extract headings
    const headings = await page.evaluate(() => {
      const hs = document.querySelectorAll('h1, h2, h3, h4');
      return Array.from(hs).slice(0, 30).map((h) => ({
        level: h.tagName.toLowerCase(),
        text: (h.textContent || '').trim().substring(0, 200),
      }));
    });

    // Extract relevant links
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href]');
      return Array.from(anchors)
        .filter((a) => {
          const href = (a as HTMLAnchorElement).href || '';
          return href.startsWith('http') && (a.textContent || '').trim().length > 0;
        })
        .slice(0, 50)
        .map((a) => ({
          href: (a as HTMLAnchorElement).href,
          text: ((a as HTMLAnchorElement).textContent || '').trim().substring(0, 150),
        }));
    });

    const cveIds = this.extractCveIds(textContent);

    return { title, textContent, headings, links, cveIds };
  }

  // ─── Public API: research_browse ──────────────────────────────────

  async researchBrowse(
    conversationId: string,
    url: string,
  ): Promise<ResearchBrowseResult> {
    // Validate URL
    if (!url || !url.trim()) {
      return { success: false, url, error: 'URL is required' };
    }

    const trimmedUrl = url.trim();

    // Validate domain
    if (!this.isAllowedDomain(trimmedUrl)) {
      return {
        success: false,
        url: trimmedUrl,
        error: `Domain not in research allowlist. Allowed: CVE databases (cve.mitre.org, nvd.nist.gov, cvedetails.com), exploit-db.com, OWASP, PortSwigger, HackTricks, GitHub advisories, and security blogs. Use exec with curl for other domains.`,
      };
    }

    // Check session quota
    const session = this.getSession(conversationId);
    const quotaError = this.checkQuota(session);
    if (quotaError) {
      return { success: false, url: trimmedUrl, error: quotaError };
    }

    // Rate limit
    await this.enforceRateLimit(session);

    let page: any;
    try {
      const browser = await this.ensureBrowser();
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        // Block downloads
        acceptDownloads: false,
      });

      // Block file downloads at context level
      context.on('download', (download: any) => {
        this.logger.warn(`Research download blocked: ${download.suggestedFilename()}`);
        download.cancel();
      });

      page = await context.newPage();

      // Block form submissions
      await page.addInitScript(() => {
        // Override form submit to prevent actual submission
        HTMLFormElement.prototype.submit = function () {
          console.warn('[ResearchBrowser] Form submission blocked');
        };
      });

      // Navigate
      await page.goto(trimmedUrl, {
        waitUntil: 'networkidle',
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      // Extract content
      const content = await this.extractPageContent(page);

      this.logger.log(
        `Research browse: ${trimmedUrl} — ${content.cveIds.length} CVEs found, ${content.textContent.length} chars`,
      );

      return {
        success: true,
        url: trimmedUrl,
        finalUrl: page.url(),
        title: content.title,
        textContent: content.textContent,
        headings: content.headings,
        links: content.links,
        cveIds: content.cveIds,
      };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`Research browse failed for ${trimmedUrl}: ${msg}`);
      return { success: false, url: trimmedUrl, error: msg };
    } finally {
      if (page) {
        try {
          await page.context()?.close().catch(() => {});
        } catch {}
      }
    }
  }

  // ─── Public API: research_search ──────────────────────────────────

  async researchSearch(
    conversationId: string,
    query: string,
  ): Promise<ResearchSearchResult> {
    if (!query || !query.trim()) {
      return { success: false, query: '', results: [], totalResults: 0, error: 'Query is required' };
    }

    const trimmedQuery = query.trim();

    // Check session quota
    const session = this.getSession(conversationId);
    const quotaError = this.checkQuota(session);
    if (quotaError) {
      return { success: false, query: trimmedQuery, results: [], totalResults: 0, error: quotaError };
    }

    // Rate limit
    await this.enforceRateLimit(session);

    let page: any;
    try {
      const browser = await this.ensureBrowser();
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        acceptDownloads: false,
      });

      page = await context.newPage();

      // Use DuckDuckGo HTML version (no JS required, no API key)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmedQuery)}`;
      await page.goto(searchUrl, {
        waitUntil: 'networkidle',
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      // Parse DuckDuckGo HTML results
      const results: SearchResult[] = await page.evaluate(() => {
        const items: SearchResult[] = [];
        // DuckDuckGo HTML uses .result class
        const resultElements = document.querySelectorAll('.result');
        for (const el of Array.from(resultElements).slice(0, 5)) {
          const titleEl = el.querySelector('.result__title a, .result__a');
          const snippetEl = el.querySelector('.result__snippet');
          if (titleEl) {
            const href = (titleEl as HTMLAnchorElement).href || '';
            const title = (titleEl.textContent || '').trim();
            const snippet = (snippetEl?.textContent || '').trim();
            if (title && href) {
              items.push({ title, url: href, snippet });
            }
          }
        }
        // Fallback: try alternative selectors
        if (items.length === 0) {
          const links = document.querySelectorAll('a.result-link, a[data-testid="result-title-a"]');
          for (const link of Array.from(links).slice(0, 5)) {
            items.push({
              title: (link.textContent || '').trim(),
              url: (link as HTMLAnchorElement).href || '',
              snippet: '',
            });
          }
        }
        return items;
      });

      this.logger.log(
        `Research search: "${trimmedQuery}" — ${results.length} results`,
      );

      return {
        success: true,
        query: trimmedQuery,
        results,
        totalResults: results.length,
      };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`Research search failed for "${trimmedQuery}": ${msg}`);
      return { success: false, query: trimmedQuery, results: [], totalResults: 0, error: msg };
    } finally {
      if (page) {
        try {
          await page.context()?.close().catch(() => {});
        } catch {}
      }
    }
  }

  // ─── Session Info ─────────────────────────────────────────────────

  getSessionInfo(conversationId: string): { actionsUsed: number; actionsRemaining: number } {
    const session = this.getSession(conversationId);
    return {
      actionsUsed: session.actionCount,
      actionsRemaining: Math.max(0, MAX_RESEARCH_PER_SESSION - session.actionCount),
    };
  }
}
