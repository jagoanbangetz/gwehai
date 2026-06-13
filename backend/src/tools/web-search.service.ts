/**
 * Web Search Service
 *
 * Provides exploit search, technique lookup, and reference fetching
 * for the pentest agent. Sources: Exploit-DB (searchsploit), NVD API,
 * CVE circl.lu, GitHub Advisories, PortSwigger, OWASP.
 *
 * Cache: in-memory with 1h TTL (per query key).
 * Rate limit: max 10 searches per session (tracked in-memory).
 * Safety: fetch_reference only allows trusted domains.
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import {
  SearchType,
  ExploitResult,
  TechniqueResult,
  ReferenceResult,
  WebSearchResponse,
  CachedSearch,
} from './web-search.types';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_SEARCHES_PER_SESSION = 10;
const REQUEST_TIMEOUT_MS = 15000;
const NVD_RATE_LIMIT_MS = 6000;

/** Trusted domains for fetch_reference (read-only safety) */
const TRUSTED_DOMAINS = [
  'cve.mitre.org',
  'nvd.nist.gov',
  'services.nvd.nist.gov',
  'exploit-db.com',
  'www.exploit-db.com',
  'portswigger.net',
  'portswigger.com',
  'owasp.org',
  'www.owasp.org',
  'github.com',
  'gist.github.com',
  'raw.githubusercontent.com',
  'cve.circl.lu',
  'www.cisa.gov',
  'security.snyk.io',
  'vulners.com',
  'packetstormsecurity.com',
  'secwiki.org',
];

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  /** In-memory cache: key = "type:query" lowercased */
  private cache = new Map<string, CachedSearch>();

  /** Per-session search counter: sessionId -> count */
  private sessionCounters = new Map<string, number>();

  constructor(private readonly configService: ConfigService) {
    // Periodic cache cleanup every 10 minutes
    setInterval(() => this.cleanupCache(), 10 * 60 * 1000);
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Main search entry point. Dispatches to the right handler based on type.
   * @param query - search query (exploit name, CVE ID, technique, etc.)
   * @param type - 'exploit' | 'technique' | 'reference'
   * @param url - required for 'reference' type
   * @param sessionId - for rate limiting (optional, defaults to 'global')
   */
  async search(
    query: string,
    type: SearchType,
    url?: string,
    sessionId?: string,
  ): Promise<WebSearchResponse> {
    const start = Date.now();
    const sid = sessionId || 'global';

    // Rate limit check
    this.checkRateLimit(sid);

    // Cache check
    const cacheKey = type === 'reference' ? `reference:${url}` : `${type}:${query.toLowerCase().trim()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cached_at < cached.ttl_ms) {
      this.logger.log(`Cache hit for: ${cacheKey}`);
      return {
        type,
        query: type === 'reference' ? url! : query,
        results: cached.results,
        count: cached.results.length,
        cached: true,
        search_time_ms: Date.now() - start,
      };
    }

    // Dispatch
    let results: ExploitResult[] | TechniqueResult[] | ReferenceResult[];
    switch (type) {
      case 'exploit':
        results = await this.searchExploit(query);
        break;
      case 'technique':
        results = await this.searchTechnique(query);
        break;
      case 'reference':
        if (!url) throw new BadRequestException('url is required for reference search type');
        results = [await this.fetchReference(url)];
        break;
      default:
        throw new BadRequestException(`Unknown search type: ${type}`);
    }

    // Cache results
    this.cache.set(cacheKey, {
      key: cacheKey,
      results,
      cached_at: Date.now(),
      ttl_ms: CACHE_TTL_MS,
    });

    // Increment counter
    const current = this.sessionCounters.get(sid) || 0;
    this.sessionCounters.set(sid, current + 1);

    return {
      type,
      query: type === 'reference' ? url! : query,
      results,
      count: results.length,
      cached: false,
      search_time_ms: Date.now() - start,
    };
  }

  /**
   * Reset session counter (call when a new pentest session starts).
   */
  resetSessionCounter(sessionId: string): void {
    this.sessionCounters.delete(sessionId);
  }

  /**
   * Get remaining searches for a session.
   */
  getRemainingSearches(sessionId: string): number {
    const used = this.sessionCounters.get(sessionId) || 0;
    return Math.max(0, MAX_SEARCHES_PER_SESSION - used);
  }

  // ─── Exploit Search ─────────────────────────────────────────────────

  /**
   * Search for exploits using multiple sources:
   * 1. searchsploit (local Exploit-DB mirror in container)
   * 2. NVD API (for CVE details)
   * 3. CVE circl.lu (fallback)
   */
  private async searchExploit(query: string): Promise<ExploitResult[]> {
    const q = query.trim();
    if (!q) throw new BadRequestException('query is required');

    const results: ExploitResult[] = [];
    const seen = new Set<string>();

    // Source 1: searchsploit (runs in pentest container)
    const searchsploitResults = await this.searchSearchsploit(q);
    for (const r of searchsploitResults) {
      const key = r.edb_id || r.title;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(r);
      }
    }

    // Source 2: If query looks like a CVE ID, fetch from NVD
    const cveMatch = q.match(/CVE-\d{4}-\d+/i);
    if (cveMatch) {
      const cveId = cveMatch[0].toUpperCase();
      const nvdResult = await this.fetchCveFromNvd(cveId);
      if (nvdResult) {
        const key = nvdResult.cve_id!;
        if (!seen.has(key)) {
          seen.add(key);
          results.unshift(nvdResult); // put CVE details first
        }
      }
    }

    // Source 3: Search NVD by keyword (product name)
    if (!cveMatch && results.length < 5) {
      const nvdKeywordResults = await this.searchNvdByKeyword(q);
      for (const r of nvdKeywordResults) {
        const key = r.cve_id!;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(r);
        }
      }
    }

    // Source 4: CVE circl.lu fallback
    if (results.length < 3 && cveMatch) {
      const circlResults = await this.searchCirclLu(cveMatch[0].toUpperCase());
      for (const r of circlResults) {
        const key = r.cve_id!;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(r);
        }
      }
    }

    return results.slice(0, 30); // cap at 30 results
  }

  /**
   * Run searchsploit in the pentest-tools container.
   * searchsploit is the CLI for Exploit-DB (installed via git clone).
   */
  private async searchSearchsploit(query: string): Promise<ExploitResult[]> {
    const containerName = this.configService.get<string>('PENTEST_TOOLS_CONTAINER_NAME') || 'gwehai-pentest-tools';
    const runInContainer = this.shouldRunInContainer();

    return new Promise((resolve) => {
      const cmd = 'searchsploit';
      const args = ['--json', '-w', query];

      if (runInContainer) {
        execFile('docker', ['exec', containerName, cmd, ...args], { timeout: REQUEST_TIMEOUT_MS }, (error, stdout, stderr) => {
          if (error) {
            this.logger.warn(`searchsploit failed: ${error.message}`);
            resolve([]);
            return;
          }
          resolve(this.parseSearchsploitOutput(stdout));
        });
      } else {
        execFile(cmd, args, { timeout: REQUEST_TIMEOUT_MS }, (error, stdout) => {
          if (error) {
            this.logger.warn(`searchsploit failed: ${error.message}`);
            resolve([]);
            return;
          }
          resolve(this.parseSearchsploitOutput(stdout));
        });
      }
    });
  }

  /**
   * Parse searchsploit JSON output into ExploitResult[].
   */
  private parseSearchsploitOutput(raw: string): ExploitResult[] {
    try {
      const data = JSON.parse(raw);
      const exploits = data?.RESULTS_EXPLOIT || [];
      return exploits.map((e: any) => ({
        title: e.Title || 'Unknown',
        edb_id: e.EDB_ID ? String(e.EDB_ID) : undefined,
        cve_id: e.CVE || undefined,
        platform: e.Platform || undefined,
        type: e.Type || undefined,
        author: e.Author || undefined,
        date: e.Date || undefined,
        path: e.Path || undefined,
        poc_url: e.EDB_ID ? `https://www.exploit-db.com/exploits/${e.EDB_ID}` : undefined,
        source: 'exploit-db' as const,
      }));
    } catch {
      // Fallback: parse text output
      return this.parseSearchsploitText(raw);
    }
  }

  /**
   * Fallback parser for searchsploit text output (when --json fails).
   */
  private parseSearchsploitText(raw: string): ExploitResult[] {
    const lines = raw.split('\n').filter((l) => l.trim() && !l.startsWith('-') && !l.includes('Shellcodes'));
    const results: ExploitResult[] = [];
    for (const line of lines) {
      // Typical format: "Title  | /path/to/exploit"
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 2) {
        results.push({
          title: parts[0],
          path: parts[1],
          source: 'exploit-db',
        });
      }
    }
    return results;
  }

  /**
   * Fetch a specific CVE from NVD API v2.0.
   */
  private async fetchCveFromNvd(cveId: string): Promise<ExploitResult | null> {
    try {
      const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${cveId}`;
      const apiKey = this.configService.get<string>('NVD_API_KEY');
      const headers: Record<string, string> = {
        'User-Agent': 'GwehAI-WebSearch/1.0',
      };
      if (apiKey) headers['apiKey'] = apiKey;

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) return null;

      const data = (await res.json()) as any;
      const vuln = data?.vulnerabilities?.[0]?.cve;
      if (!vuln) return null;

      const desc = vuln.descriptions?.find((d: any) => d.lang === 'en')?.value || '';
      const cvss = vuln.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore
        || vuln.metrics?.cvssMetricV30?.[0]?.cvssData?.baseScore
        || vuln.metrics?.cvssMetricV2?.[0]?.cvssData?.baseScore;

      const references = (vuln.references || []).map((r: any) => r.url).slice(0, 5);
      const exploitRef = vuln.references?.find((r: any) => r.tags?.includes('Exploit'));

      return {
        title: `${cveId}: ${desc.substring(0, 150)}`,
        cve_id: cveId,
        poc_url: exploitRef?.url || references[0],
        source: 'nvd',
      };
    } catch (err: any) {
      this.logger.warn(`NVD fetch failed for ${cveId}: ${err?.message}`);
      return null;
    }
  }

  /**
   * Search NVD by keyword (product name, software, etc.).
   * Returns recent CVEs matching the keyword.
   */
  private async searchNvdByKeyword(keyword: string): Promise<ExploitResult[]> {
    try {
      const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(keyword)}&resultsPerPage=10`;
      const apiKey = this.configService.get<string>('NVD_API_KEY');
      const headers: Record<string, string> = {
        'User-Agent': 'GwehAI-WebSearch/1.0',
      };
      if (apiKey) headers['apiKey'] = apiKey;

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) return [];

      const data = (await res.json()) as any;
      const vulns = data?.vulnerabilities || [];

      return vulns.map((v: any) => {
        const cve = v?.cve;
        if (!cve?.id) return null;
        const desc = cve.descriptions?.find((d: any) => d.lang === 'en')?.value || '';
        const exploitRef = cve.references?.find((r: any) => r.tags?.includes('Exploit'));
        return {
          title: `${cve.id}: ${desc.substring(0, 150)}`,
          cve_id: cve.id,
          poc_url: exploitRef?.url || cve.references?.[0]?.url,
          source: 'nvd' as const,
        };
      }).filter(Boolean) as ExploitResult[];
    } catch (err: any) {
      this.logger.warn(`NVD keyword search failed: ${err?.message}`);
      return [];
    }
  }

  /**
   * Fallback: search CVE circl.lu for a specific CVE.
   */
  private async searchCirclLu(cveId: string): Promise<ExploitResult[]> {
    try {
      const url = `https://cve.circl.lu/api/cve/${cveId}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) return [];

      const data = (await res.json()) as any;
      if (!data?.id) return [];

      return [{
        title: `${data.id}: ${(data.summary || '').substring(0, 150)}`,
        cve_id: data.id,
        source: 'exploit-db' as const,
      }];
    } catch {
      return [];
    }
  }

  // ─── Technique Search ───────────────────────────────────────────────

  /**
   * Search for pentest techniques. Sources:
   * 1. PortSwigger Web Security Academy (via search)
   * 2. OWASP references
   * 3. GitHub Security Advisories (keyword search)
   * 4. Nuclei templates (local in container)
   */
  private async searchTechnique(query: string): Promise<TechniqueResult[]> {
    const q = query.trim();
    if (!q) throw new BadRequestException('query is required');

    const results: TechniqueResult[] = [];

    // Source 1: OWASP references (curated knowledge)
    const owaspResults = this.searchOwaspReferences(q);
    results.push(...owaspResults);

    // Source 2: GitHub Security Advisories
    const ghsaResults = await this.searchGithubAdvisories(q);
    results.push(...ghsaResults);

    // Source 3: PortSwigger research links
    const portswiggerResults = this.searchPortswiggerReferences(q);
    results.push(...portswiggerResults);

    // Source 4: Nuclei template search (in container)
    const nucleiResults = await this.searchNucleiTemplates(q);
    results.push(...nucleiResults);

    return results.slice(0, 20);
  }

  /**
   * Curated OWASP references for common techniques.
   * Returns relevant links based on keyword matching.
   */
  private searchOwaspReferences(query: string): TechniqueResult[] {
    const q = query.toLowerCase();
    const owaspDb: TechniqueResult[] = [
      {
        title: 'SQL Injection',
        summary: 'SQL injection is a web security vulnerability that allows an attacker to interfere with the queries that an application makes to its database. Techniques: Union-based, Blind (boolean/time-based), Error-based, Out-of-band.',
        references: [
          'https://owasp.org/www-community/attacks/SQL_Injection',
          'https://portswigger.net/web-security/sql-injection',
        ],
        source: 'owasp',
        tags: ['sqli', 'sql', 'injection', 'database'],
      },
      {
        title: 'Cross-Site Scripting (XSS)',
        summary: 'XSS allows attackers to inject client-side scripts into web pages. Types: Reflected, Stored, DOM-based. Bypasses: encoding tricks, CSP bypass, mutation XSS.',
        references: [
          'https://owasp.org/www-community/attacks/xss/',
          'https://portswigger.net/web-security/cross-site-scripting',
        ],
        source: 'owasp',
        tags: ['xss', 'cross-site scripting', 'scripting', 'reflected', 'stored', 'dom'],
      },
      {
        title: 'Server-Side Request Forgery (SSRF)',
        summary: 'SSRF allows an attacker to induce the server-side application to make HTTP requests to an arbitrary domain. Escalation: SSRF to RCE via cloud metadata, internal service access, port scanning.',
        references: [
          'https://owasp.org/www-community/attacks/Server_Side_Request_Forgery',
          'https://portswigger.net/web-security/ssrf',
        ],
        source: 'owasp',
        tags: ['ssrf', 'request forgery', 'internal', 'cloud metadata', 'rce'],
      },
      {
        title: 'JWT Vulnerabilities',
        summary: 'JWT attack vectors: alg=none bypass, weak HMAC secret, key confusion (RS256→HS256), JWK injection, kid injection, expired token bypass, signature stripping.',
        references: [
          'https://portswigger.net/web-security/jwt',
          'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management_Testing/10-Testing_JSON_Web_Tokens',
        ],
        source: 'owasp',
        tags: ['jwt', 'json web token', 'authentication', 'token', 'session'],
      },
      {
        title: 'Path Traversal / LFI',
        summary: 'Local File Inclusion and path traversal allow reading arbitrary files on the server. Techniques: ../ sequences, null byte injection, double encoding, PHP wrappers (php://filter, data://).',
        references: [
          'https://owasp.org/www-community/attacks/Path_Traversal',
          'https://portswigger.net/web-security/file-path-traversal',
        ],
        source: 'owasp',
        tags: ['lfi', 'path traversal', 'file inclusion', 'directory traversal', 'local file'],
      },
      {
        title: 'Command Injection',
        summary: 'OS command injection allows executing arbitrary commands on the host OS. Techniques: pipe chaining, backticks, $(), semicolons, newlines. Blind: time delays, OOB exfiltration.',
        references: [
          'https://owasp.org/www-community/attacks/Command_Injection',
          'https://portswigger.net/web-security/os-command-injection',
        ],
        source: 'owasp',
        tags: ['command injection', 'rce', 'os injection', 'shell', 'remote code execution'],
      },
      {
        title: 'IDOR (Insecure Direct Object Reference)',
        summary: 'IDOR allows accessing resources by manipulating identifiers. Test: increment IDs, UUID guessing, parameter pollution, method override.',
        references: [
          'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References',
          'https://portswigger.net/web-security/access-control/idor',
        ],
        source: 'owasp',
        tags: ['idor', 'access control', 'direct object reference', 'authorization'],
      },
      {
        title: 'GraphQL Injection',
        summary: 'GraphQL attack surface: introspection queries, batch queries, nested queries (DoS), injection in arguments, alias-based rate limit bypass.',
        references: [
          'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/12-API_Testing/01-Testing_GraphQL',
          'https://portswigger.net/web-security/graphql',
        ],
        source: 'owasp',
        tags: ['graphql', 'api', 'introspection', 'query'],
      },
      {
        title: 'XXE (XML External Entity)',
        summary: 'XXE injection via XML parsers. Techniques: file exfiltration, SSRF via XXE, blind XXE with OOB, parameter entity injection, XInclude attacks.',
        references: [
          'https://owasp.org/www-community/vulnerabilities/XML_External_Entity_(XXE)_Processing',
          'https://portswigger.net/web-security/xxe',
        ],
        source: 'owasp',
        tags: ['xxe', 'xml', 'external entity', 'xml injection'],
      },
      {
        title: 'CSRF (Cross-Site Request Forgery)',
        summary: 'CSRF forces authenticated users to submit unwanted requests. Bypasses: token fixation, CORS misconfiguration, clickjacking combo, SameSite cookie bypass.',
        references: [
          'https://owasp.org/www-community/attacks/csrf',
          'https://portswigger.net/web-security/csrf',
        ],
        source: 'owasp',
        tags: ['csrf', 'cross-site request forgery', 'request forgery'],
      },
      {
        title: 'Authentication Bypass',
        summary: 'Auth bypass techniques: password brute force, credential stuffing, MFA bypass, password reset flaws, session fixation, broken access control.',
        references: [
          'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/04-Authentication_Testing/',
          'https://portswigger.net/web-security/authentication',
        ],
        source: 'owasp',
        tags: ['authentication', 'auth bypass', 'login', 'password', 'brute force', 'credential'],
      },
      {
        title: 'Subdomain Takeover',
        summary: 'Subdomain takeover occurs when a subdomain points to a deprovisioned cloud resource. Check: CNAME to unclaimed S3/Heroku/GitHub Pages/Azure. Tools: subjack, can-i-take-over-xyz.',
        references: [
          'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/10-Test_for_Subdomain_Takeover',
        ],
        source: 'owasp',
        tags: ['subdomain takeover', 'dns', 'cname', 'cloud', 'takeover'],
      },
    ];

    // Match by tags
    const qTerms = q.split(/\s+/);
    return owaspDb.filter((entry) =>
      entry.tags?.some((tag) =>
        qTerms.some((term) => tag.includes(term) || term.includes(tag)),
      ) || entry.title.toLowerCase().includes(q),
    );
  }

  /**
   * Search GitHub Security Advisories by keyword.
   */
  private async searchGithubAdvisories(query: string): Promise<TechniqueResult[]> {
    try {
      const url = `https://api.github.com/advisories?per_page=5&sort=published&direction=desc&keyword=${encodeURIComponent(query)}`;
      const token = this.configService.get<string>('GITHUB_TOKEN');
      const headers: Record<string, string> = {
        'User-Agent': 'GwehAI-WebSearch/1.0',
        Accept: 'application/vnd.github+json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) return [];

      const data = (await res.json()) as any[];
      if (!Array.isArray(data)) return [];

      return data.map((advisory: any) => ({
        title: advisory.summary || advisory.ghsa_id || 'GitHub Advisory',
        summary: (advisory.description || '').substring(0, 300),
        references: [
          advisory.html_url,
          ...(advisory.references?.map((r: any) => r.url) || []),
        ].filter(Boolean).slice(0, 3),
        source: 'github-advisory',
        tags: [query.toLowerCase()],
      }));
    } catch (err: any) {
      this.logger.warn(`GHSA search failed: ${err?.message}`);
      return [];
    }
  }

  /**
   * Return PortSwigger research links for known techniques.
   */
  private searchPortswiggerReferences(query: string): TechniqueResult[] {
    const q = query.toLowerCase();
    const psLinks: Record<string, TechniqueResult> = {
      'sql injection': {
        title: 'PortSwigger: SQL Injection',
        summary: 'Comprehensive SQL injection labs and research from PortSwigger Web Security Academy.',
        references: ['https://portswigger.net/web-security/sql-injection', 'https://portswigger.net/research/'],
        source: 'portswigger',
        tags: ['sqli'],
      },
      'xss': {
        title: 'PortSwigger: Cross-Site Scripting',
        summary: 'XSS labs, filter bypass techniques, and CSP research from PortSwigger.',
        references: ['https://portswigger.net/web-security/cross-site-scripting'],
        source: 'portswigger',
        tags: ['xss'],
      },
      'ssrf': {
        title: 'PortSwigger: SSRF',
        summary: 'SSRF labs and exploitation techniques including cloud metadata access.',
        references: ['https://portswigger.net/web-security/ssrf'],
        source: 'portswigger',
        tags: ['ssrf'],
      },
      'jwt': {
        title: 'PortSwigger: JWT Attacks',
        summary: 'JWT vulnerability labs: alg=none, key confusion, jwk injection.',
        references: ['https://portswigger.net/web-security/jwt'],
        source: 'portswigger',
        tags: ['jwt'],
      },
      'access control': {
        title: 'PortSwigger: Access Control',
        summary: 'IDOR, privilege escalation, and broken access control labs.',
        references: ['https://portswigger.net/web-security/access-control'],
        source: 'portswigger',
        tags: ['idor', 'access control'],
      },
    };

    const results: TechniqueResult[] = [];
    for (const [key, value] of Object.entries(psLinks)) {
      if (q.includes(key) || key.includes(q)) {
        results.push(value);
      }
    }
    return results;
  }

  /**
   * Search nuclei templates in the pentest container.
   */
  private async searchNucleiTemplates(query: string): Promise<TechniqueResult[]> {
    const containerName = this.configService.get<string>('PENTEST_TOOLS_CONTAINER_NAME') || 'gwehai-pentest-tools';
    const runInContainer = this.shouldRunInContainer();

    return new Promise((resolve) => {
      const cmd = 'grep';
      const args = ['-ril', query.toLowerCase(), '/opt/nuclei-templates/'];

      const handler = (error: any, stdout: string) => {
        if (error || !stdout.trim()) {
          resolve([]);
          return;
        }
        const files = stdout.trim().split('\n').filter(Boolean).slice(0, 5);
        resolve(files.map((f) => ({
          title: `Nuclei Template: ${f.split('/').pop()}`,
          summary: `Matching nuclei template for "${query}". Run with: nuclei -t ${f} -u <target>`,
          references: [f],
          source: 'nuclei-templates',
          tags: [query.toLowerCase()],
        })));
      };

      if (runInContainer) {
        execFile('docker', ['exec', containerName, cmd, ...args], { timeout: REQUEST_TIMEOUT_MS }, handler);
      } else {
        execFile(cmd, args, { timeout: REQUEST_TIMEOUT_MS }, handler);
      }
    });
  }

  // ─── Reference Fetching ─────────────────────────────────────────────

  /**
   * Fetch a reference URL and return plain text content.
   * Safety: only trusted domains allowed.
   */
  async fetchReference(url: string): Promise<ReferenceResult> {
    const u = url.trim();
    if (!u) throw new BadRequestException('url is required');

    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      throw new BadRequestException(`Invalid URL: ${u}`);
    }

    // Domain whitelist check
    const hostname = parsed.hostname.toLowerCase();
    const isTrusted = TRUSTED_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
    if (!isTrusted) {
      throw new BadRequestException(
        `Domain not trusted: ${hostname}. Allowed: ${TRUSTED_DOMAINS.join(', ')}`,
      );
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Only http/https URLs are allowed');
    }

    try {
      const res = await fetch(u, {
        headers: {
          'User-Agent': 'GwehAI-WebSearch/1.0 (pentest research)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const html = await res.text();
      const content = this.stripHtml(html);
      const maxLen = 8000; // cap content length
      const truncated = content.length > maxLen;

      return {
        url: u,
        title: this.extractTitle(html),
        content: truncated ? content.substring(0, maxLen) + '\n\n[...truncated]' : content,
        fetched_at: new Date().toISOString(),
        truncated,
      };
    } catch (err: any) {
      throw new BadRequestException(`Failed to fetch ${u}: ${err?.message}`);
    }
  }

  /**
   * Strip HTML tags and decode entities. Returns plain text.
   */
  private stripHtml(html: string): string {
    let text = html
      // Remove script/style blocks entirely
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      // Convert block elements to newlines
      .replace(/<\/?(p|div|br|hr|li|h[1-6]|tr|blockquote)[^>]*\/?>/gi, '\n')
      // Remove all remaining tags
      .replace(/<[^>]+>/g, '')
      // Decode common HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, '')
      // Collapse whitespace
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return text;
  }

  /**
   * Extract title from HTML.
   */
  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? match[1].replace(/\s+/g, ' ').trim() : 'Untitled';
  }

  // ─── Utilities ──────────────────────────────────────────────────────

  private checkRateLimit(sessionId: string): void {
    const used = this.sessionCounters.get(sessionId) || 0;
    if (used >= MAX_SEARCHES_PER_SESSION) {
      throw new BadRequestException(
        `Rate limit reached: max ${MAX_SEARCHES_PER_SESSION} searches per session. Used: ${used}.`,
      );
    }
  }

  private shouldRunInContainer(): boolean {
    const v = this.configService.get<string>('PENTEST_RUN_IN_CONTAINER');
    if (v === 'false' || v === '0' || v === 'no') return false;
    return true;
  }

  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.cached_at > entry.ttl_ms) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.log(`Cache cleanup: removed ${cleaned} expired entries, ${this.cache.size} remaining`);
    }
  }
}
