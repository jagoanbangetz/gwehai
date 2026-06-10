/**
 * Re-Verify Service
 * 
 * Re-verifies HIGH/CRITICAL findings before ReportAgent compiles the final report.
 * Prevents chained errors — if VerifyAgent misread tool output and reported a 
 * false positive, ReportAgent detects it during re-verification.
 * 
 * Safety caps:
 * - Max 3 re-verify attempts per finding
 * - After 3 FAILED attempts → flag as DISPUTED, skip from report
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, VerificationStatus } from '../entities/report.entity';
import { ToolsService } from '../tools/tools.service';

/** Severity levels that trigger re-verification. */
const REVERIFY_SEVERITIES = ['HIGH', 'CRITICAL'];

/** Max re-verify attempts before flagging as DISPUTED. */
const MAX_REVERIFY_ATTEMPTS = 3;

@Injectable()
export class ReVerifyService {
  private readonly logger = new Logger(ReVerifyService.name);

  constructor(
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    private readonly toolsService: ToolsService,
  ) {}

  /**
   * Get all HIGH/CRITICAL findings for a conversation that need re-verification.
   */
  async getFindingsNeedingReVerification(
    userId: string,
    conversationId: string,
  ): Promise<Report[]> {
    return this.reportRepo
      .createQueryBuilder('r')
      .where('r.userId = :userId', { userId })
      .andWhere('r.conversationId = :conversationId', { conversationId })
      .andWhere('r.status = :status', { status: 'completed' })
      .andWhere("r.metadata->>'severity' IN (:...severities)", { severities: REVERIFY_SEVERITIES })
      .andWhere('r.verificationStatus IN (:...statuses)', {
        statuses: [VerificationStatus.PENDING, VerificationStatus.FAILED],
      })
      .andWhere('r.verificationAttempts < :maxAttempts', { maxAttempts: MAX_REVERIFY_ATTEMPTS })
      .getMany();
  }

  /**
   * Re-verify a single finding. Returns the updated verification status.
   */
  async reVerifyFinding(finding: Report): Promise<{
    status: VerificationStatus;
    evidence?: string;
    attempts: number;
  }> {
    const attempts = (finding.verificationAttempts || 0) + 1;
    this.logger.log(`Re-verifying finding ${finding.id} (attempt ${attempts}/${MAX_REVERIFY_ATTEMPTS})`);

    // Build verification command based on finding type
    const verifyCmd = this.buildVerifyCommand(finding);
    if (!verifyCmd) {
      // Can't auto-verify this type — skip (e.g. logic flaw, manual check)
      await this.reportRepo.update(finding.id, {
        verificationStatus: VerificationStatus.SKIPPED,
        verificationAttempts: attempts,
        verifiedAt: new Date(),
      } as any);
      return { status: VerificationStatus.SKIPPED, attempts };
    }

    try {
      const result = await this.toolsService.execCommand({
        command: verifyCmd.command,
        args: verifyCmd.args,
        commandLine: verifyCmd.commandLine,
        timeoutMs: 30000,
      });

      const passed = this.evaluateVerificationResult(finding, result.stdout, result.stderr, result.exitCode);
      const newStatus = passed ? VerificationStatus.PASSED : VerificationStatus.FAILED;

      await this.reportRepo.update(finding.id, {
        verificationStatus: newStatus,
        verificationAttempts: attempts,
        verifiedAt: passed ? new Date() : null,
        metadata: {
          ...finding.metadata,
          last_verify_output: result.stdout.substring(0, 2000),
          last_verify_exit_code: result.exitCode,
        },
      } as any);

      this.logger.log(`Finding ${finding.id} re-verify result: ${newStatus} (attempt ${attempts})`);
      return { status: newStatus, evidence: result.stdout.substring(0, 500), attempts };
    } catch (err: any) {
      this.logger.warn(`Re-verify error for finding ${finding.id}: ${err?.message}`);
      await this.reportRepo.update(finding.id, {
        verificationStatus: VerificationStatus.FAILED,
        verificationAttempts: attempts,
      } as any);
      return { status: VerificationStatus.FAILED, attempts };
    }
  }

  /**
   * Re-verify all HIGH/CRITICAL findings for a conversation.
   * Returns summary of results.
   */
  async reVerifyAllHighCritical(
    userId: string,
    conversationId: string,
  ): Promise<{
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    disputed: number;
    results: Array<{ findingId: string; title: string | null; status: VerificationStatus; attempts: number }>;
  }> {
    const findings = await this.getFindingsNeedingReVerification(userId, conversationId);
    
    if (findings.length === 0) {
      return { total: 0, passed: 0, failed: 0, skipped: 0, disputed: 0, results: [] };
    }

    this.logger.log(`Re-verifying ${findings.length} HIGH/CRITICAL findings for conversation ${conversationId}`);

    const results: Array<{ findingId: string; title: string | null; status: VerificationStatus; attempts: number }> = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let disputed = 0;

    for (const finding of findings) {
      const result = await this.reVerifyFinding(finding);
      results.push({
        findingId: finding.id,
        title: finding.metadata?.title ?? finding.detail?.substring(0, 80) ?? null,
        status: result.status,
        attempts: result.attempts,
      });

      switch (result.status) {
        case VerificationStatus.PASSED:
          passed++;
          break;
        case VerificationStatus.FAILED:
          if (result.attempts >= MAX_REVERIFY_ATTEMPTS) {
            disputed++;
            // Mark as DISPUTED in metadata after max attempts
            await this.reportRepo.update(finding.id, {
              metadata: {
                ...finding.metadata,
                disputed: true,
                dispute_reason: `Failed re-verification ${MAX_REVERIFY_ATTEMPTS} times — likely false positive`,
              },
            } as any);
          } else {
            failed++;
          }
          break;
        case VerificationStatus.SKIPPED:
          skipped++;
          break;
      }
    }

    return { total: findings.length, passed, failed, skipped, disputed, results };
  }

  /**
   * Build a verification command based on the finding's vulnerability type.
   * Returns null if we can't auto-verify (manual-only types).
   */
  private buildVerifyCommand(finding: Report): { command: string; args?: string[]; commandLine?: string } | null {
    const detail = (finding.detail || '').toLowerCase();
    const poc = (finding.poc || '').toLowerCase();
    const title = (finding.metadata?.title || '').toLowerCase();
    const target = finding.target || '';
    const combined = `${detail} ${poc} ${title}`;

    // SQLi → sqlmap --batch
    if (combined.includes('sql') && (combined.includes('injection') || combined.includes('sqli'))) {
      const url = this.extractUrl(target, finding.poc || '');
      if (url) {
        return {
          command: 'sqlmap',
          commandLine: `sqlmap -u "${url}" --batch --level=1 --risk=1 --smart --timeout=10 --retries=1`,
        };
      }
    }

    // XSS → curl with payload
    if (combined.includes('xss') || combined.includes('cross-site scripting') || combined.includes('<script')) {
      const url = this.extractUrl(target, finding.poc || '');
      if (url) {
        return {
          command: 'curl',
          commandLine: `curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${url}"`,
        };
      }
    }

    // IDOR → curl endpoint with different user context
    if (combined.includes('idor') || combined.includes('access control') || combined.includes('privilege')) {
      const url = this.extractUrl(target, finding.poc || '');
      if (url) {
        return {
          command: 'curl',
          commandLine: `curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${url}"`,
        };
      }
    }

    // SSRF → curl endpoint
    if (combined.includes('ssrf') || combined.includes('server-side request forgery')) {
      const url = this.extractUrl(target, finding.poc || '');
      if (url) {
        return {
          command: 'curl',
          commandLine: `curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${url}"`,
        };
      }
    }

    // Open redirect → curl check redirect
    if (combined.includes('open redirect') || combined.includes('redirect')) {
      const url = this.extractUrl(target, finding.poc || '');
      if (url) {
        return {
          command: 'curl',
          commandLine: `curl -s -L -o /dev/null -w '%{url_effective}' --max-time 10 "${url}"`,
        };
      }
    }

    // CSRF, LFI, command injection, XXE, NoSQL → curl basic check
    if (combined.includes('csrf') || combined.includes('lfi') || combined.includes('path traversal') ||
        combined.includes('command injection') || combined.includes('xxe') || combined.includes('nosql')) {
      const url = this.extractUrl(target, finding.poc || '');
      if (url) {
        return {
          command: 'curl',
          commandLine: `curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${url}"`,
        };
      }
    }

    // Generic: if we have a target URL, do a basic reachability check
    if (target && target.startsWith('http')) {
      return {
        command: 'curl',
        commandLine: `curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${target}"`,
      };
    }

    return null;
  }

  /**
   * Evaluate whether the verification result confirms the finding.
   */
  private evaluateVerificationResult(
    finding: Report,
    stdout: string,
    stderr: string,
    exitCode: number,
  ): boolean {
    const detail = (finding.detail || '').toLowerCase();
    const poc = (finding.poc || '').toLowerCase();
    const combined = `${detail} ${poc}`;

    // SQLi: sqlmap found injection
    if (combined.includes('sql') && (combined.includes('injection') || combined.includes('sqli'))) {
      return (
        stdout.includes('is vulnerable') ||
        stdout.includes('is injectable') ||
        stdout.includes('sqlmap identified') ||
        (stdout.includes('Type:') && stdout.includes('Title:'))
      );
    }

    // XSS: check if payload reflects
    if (combined.includes('xss') || combined.includes('cross-site scripting')) {
      return exitCode === 0 && !stdout.includes('404') && !stdout.includes('500');
    }

    // IDOR: check if endpoint still accessible
    if (combined.includes('idor') || combined.includes('access control')) {
      return exitCode === 0 && !stdout.includes('401') && !stdout.includes('403');
    }

    // Open redirect: check if effective URL changed
    if (combined.includes('redirect')) {
      return exitCode === 0;
    }

    // Generic: endpoint reachable (HTTP 2xx or 3xx)
    return exitCode === 0;
  }

  /**
   * Extract URL from target or POC text.
   */
  private extractUrl(target: string, poc: string): string | null {
    if (target && target.startsWith('http')) {
      return target;
    }

    const urlMatch = poc.match(/https?:\/\/[^\s"'<>]+/);
    if (urlMatch) {
      return urlMatch[0];
    }

    return null;
  }
}
