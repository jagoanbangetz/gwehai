import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execFile, exec } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ConversationMemory } from '../entities/conversation-memory.entity';
import { PayloadSandboxService } from './payload-sandbox.service';

export interface MemorySearchResult {
  path: string;
  snippet: string;
  fromLine?: number;
  toLine?: number;
}

@Injectable()
export class ToolsService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ConversationMemory)
    private readonly memoryRepo: Repository<ConversationMemory>,
    private readonly payloadSandbox: PayloadSandboxService,
  ) {}

  /** Conversation memory is scoped by conversationId (jobId). One conversation = one context; validation enforces jobId for memory access. */
  async memorySearch(query: string, maxResults: number = 10, jobId?: string): Promise<MemorySearchResult[]> {
    if (!query || !query.trim()) {
      throw new BadRequestException('query is required');
    }
    if (!jobId || !jobId.trim()) {
      throw new BadRequestException(
        'Conversation context (jobId) is required for memory_search. One conversation = one pentest context.',
      );
    }

    const needle = query.toLowerCase();
    const results: MemorySearchResult[] = [];

    // Memory is one row per conversation, data = JSON { key: value }
    {
      const row = await this.memoryRepo.findOne({ where: { conversationId: jobId } });
      const data = (row?.data ?? {}) as Record<string, string>;
      for (const [key, value] of Object.entries(data)) {
        const lines = String(value).split(/\r?\n/);
        for (let i = 0; i < lines.length; i += 1) {
          if (lines[i].toLowerCase().includes(needle)) {
            results.push({
              path: key,
              snippet: lines[i],
              fromLine: i + 1,
              toLine: i + 1,
            });
            if (results.length >= maxResults) return results;
          }
        }
      }
    }
    return results;
  }

  /** Normalize memory key: main or daily/YYYY-MM-DD or daily/website/YYYY-MM-DD (no .md). */
  private normalizeMemoryKey(p: string): string {
    const t = p.trim();
    if (t === 'MEMORY.md' || t === 'main') return 'main';
    const dailyWithWebsite = t.match(/^daily\/([^/]+)\/(\d{4}-\d{2}-\d{2})$/);
    if (dailyWithWebsite) return `daily/${dailyWithWebsite[1]}/${dailyWithWebsite[2]}`;
    const memoryDailyWithWebsite = t.match(/^memory\/([^/]+)\/(\d{4}-\d{2}-\d{2})(\.md)?$/);
    if (memoryDailyWithWebsite) return `daily/${memoryDailyWithWebsite[1]}/${memoryDailyWithWebsite[2]}`;
    const dailyMatch = t.match(/^memory\/(\d{4}-\d{2}-\d{2})(\.md)?$/);
    if (dailyMatch) return `daily/${dailyMatch[1]}`;
    if (t.match(/^daily\/\d{4}-\d{2}-\d{2}$/)) return t;
    if (t.match(/^daily\/[^/]+\/\d{4}-\d{2}-\d{2}$/)) return t;
    return t;
  }

  /** True if path is conversation memory (DB-only, stored in JSON). */
  private isMemoryPath(p: string): boolean {
    const t = p.trim();
    return t === 'MEMORY.md' || t === 'main' || t.startsWith('memory/') || t.startsWith('daily/');
  }

  async memoryGet(filePath: string, from?: number, lines?: number, jobId?: string): Promise<string> {
    if (filePath === 'SCOPE.md') {
      const resolved = this.resolveMemoryPath(filePath, undefined);
      const content = await this.readExistingFile(resolved, true);
      if (!from) return content;
      const allLines = content.split(/\r?\n/);
      const start = Math.max(0, from - 1);
      const end = Math.min(allLines.length, start + (lines || allLines.length));
      return allLines.slice(start, end).join('\n');
    }

    if (filePath.startsWith('skills/')) {
      const resolved = this.resolveSkillsPath(filePath);
      const content = await this.readExistingFile(resolved, true);
      if (!from) return content;
      const allLines = content.split(/\r?\n/);
      const start = Math.max(0, from - 1);
      const end = Math.min(allLines.length, start + (lines || allLines.length));
      return allLines.slice(start, end).join('\n');
    }

    // Conversation memory: one row per conversation, data = JSON { key: value }
    if (this.isMemoryPath(filePath)) {
      if (!jobId || !jobId.trim()) {
        throw new BadRequestException(
          'Conversation context (jobId) is required for memory_get on pentest state. One conversation = one pentest context.',
        );
      }
      const key = this.normalizeMemoryKey(filePath);
      const row = await this.memoryRepo.findOne({ where: { conversationId: jobId } });
      const data = (row?.data ?? {}) as Record<string, string>;
      let content = data[key] ?? data[filePath] ?? ''; // fallback for old keys
      if (!from) return content;
      const allLines = content.split(/\r?\n/);
      const start = Math.max(0, from - 1);
      const end = Math.min(allLines.length, start + (lines || allLines.length));
      return allLines.slice(start, end).join('\n');
    }

    const resolved = this.resolveMemoryPath(filePath, jobId);
    const content = await this.readExistingFile(resolved, true);
    if (!from) return content;
    const allLines = content.split(/\r?\n/);
    const start = Math.max(0, from - 1);
    const end = Math.min(allLines.length, start + (lines || allLines.length));
    return allLines.slice(start, end).join('\n');
  }

  async writeFile(filePath: string, content: string, append: boolean = false, jobId?: string): Promise<{ ok: true; path: string }> {
    if (!filePath || !content) {
      throw new BadRequestException('path and content are required');
    }
    if (!this.isMemoryPath(filePath)) {
      throw new BadRequestException('path must be main, daily/YYYY-MM-DD, or daily/website/YYYY-MM-DD (e.g. daily/testphp.vulnweb.com/2026-02-10). Conversation memory is stored only in the database.');
    }

    if (!jobId || !jobId.trim()) {
      throw new BadRequestException(
        'Conversation context (jobId) is required to write memory. One conversation = one pentest context; memory is stored per conversation.',
      );
    }

    const key = this.normalizeMemoryKey(filePath);
    let row = await this.memoryRepo.findOne({ where: { conversationId: jobId } });
    const data = row ? { ...(row.data as Record<string, string>) } : {};
    const current = data[key] ?? '';
    data[key] = append ? (current ? `${current}\n${content}` : content) : content;

    if (row) {
      row.data = data;
      await this.memoryRepo.save(row);
    } else {
      row = this.memoryRepo.create({
        conversationId: jobId,
        data,
      });
      await this.memoryRepo.save(row);
    }
    return { ok: true, path: key };
  }

  /** Shell metacharacters that require running via a shell (e.g. so pipes work). */
  private static readonly SHELL_META = /[|;&<>()$`\\\n]/;

  /** When true, exec runs commands inside the pentest-tools Docker container via docker exec. Default true so tools run in container; set PENTEST_RUN_IN_CONTAINER=false to run on host. */
  private getRunInContainer(): boolean {
    const v = this.configService.get<string>('PENTEST_RUN_IN_CONTAINER');
    if (v === 'false' || v === '0' || v === 'no') return false;
    return v === 'true' || v === '1' || v === 'yes' || v === undefined;
  }

  /** Container name for docker exec (e.g. gwehai-pentest-tools). Must be running: docker compose up -d pentest-tools */
  private getToolsContainerName(): string | null {
    const name = this.configService.get<string>('PENTEST_TOOLS_CONTAINER_NAME');
    return name?.trim() || 'gwehai-pentest-tools';
  }

  async execCommand(options: {
    command: string;
    args?: string[];
    /** Full command string; when present and contains shell chars (e.g. |), run via shell so pipes work. */
    commandLine?: string;
    target?: string;
    timeoutMs?: number;
    cwd?: string;
  }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const command = options.command;
    if (!command) {
      throw new BadRequestException('command is required');
    }

    const allow = this.getAllowlist();
    if (!allow.has(command)) {
      throw new BadRequestException(`Command not allowed: ${command}`);
    }

    if (allow.get(command)?.requiresTarget) {
      if (!options.target) {
        throw new BadRequestException('target is required for this command');
      }
      // Scope check removed: AI can run allowlisted commands against any target for testing.
    }

    const cwd = options.cwd ? this.resolveWorkspacePath(options.cwd) : this.getWorkspaceRoot();
    const timeoutMs = options.timeoutMs || 60000;
    const runInContainer = this.getRunInContainer();
    const containerName = this.getToolsContainerName();

    const runWithShell = (cmdLine: string) => {
      return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
        const run = runInContainer && containerName
          ? `docker exec ${containerName} sh -c ${JSON.stringify(cmdLine)}`
          : cmdLine;
        exec(run, { cwd: runInContainer ? undefined : cwd, timeout: timeoutMs, shell: '/bin/sh' }, (error, stdout, stderr) => {
          const out = stdout || '';
          const err = stderr || '';
          const exitCode = error && typeof (error as { code?: number }).code === 'number'
            ? (error as { code: number }).code
            : error
              ? 1
              : 0;
          const stderrWithCode =
            exitCode !== 0 && err.trim() === '' ? `Command exited with code ${exitCode}` : err;
          resolve({ stdout: out, stderr: stderrWithCode, exitCode });
        });
      });
    };

    const runWithExecFile = (cmd: string, args: string[]) => {
      return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
        if (runInContainer && containerName) {
          // docker exec <container> <cmd> [args...]
          const dockerArgs = ['exec', containerName, cmd, ...args];
          execFile('docker', dockerArgs, { timeout: timeoutMs }, (error, stdout, stderr) => {
            const out = stdout || '';
            const err = stderr || '';
            const exitCode = error && typeof (error as { code?: number }).code === 'number'
              ? (error as { code: number }).code
              : error
                ? 1
                : 0;
            const stderrWithCode =
              exitCode !== 0 && err.trim() === '' ? `Command exited with code ${exitCode}` : err;
            resolve({ stdout: out, stderr: stderrWithCode, exitCode });
          });
        } else {
          execFile(cmd, args, { cwd, timeout: timeoutMs }, (error, stdout, stderr) => {
            const out = stdout || '';
            const err = stderr || '';
            const exitCode = error && typeof (error as { code?: number }).code === 'number'
              ? (error as { code: number }).code
              : error
                ? 1
                : 0;
            const stderrWithCode =
              exitCode !== 0 && err.trim() === '' ? `Command exited with code ${exitCode}` : err;
            resolve({
              stdout: out,
              stderr: stderrWithCode,
              exitCode,
            });
          });
        }
      });
    };

    const commandLine = options.commandLine?.trim();
    if (commandLine && ToolsService.SHELL_META.test(commandLine)) {
      // First token must still be allowlisted (e.g. "curl ... | head" is ok; "evil | curl" is not).
      const firstToken = commandLine.split(/\s+/)[0] || '';
      if (!allow.has(firstToken)) {
        throw new BadRequestException(`Command not allowed in shell: ${firstToken}`);
      }
      return runWithShell(commandLine);
    }

    const args = options.args || [];
    return runWithExecFile(command, args);
  }

  private getAllowlist(): Map<string, { requiresTarget: boolean }> {
    return new Map([
      // Pentest / network (target required) — match Dockerfile.pentest-tools available tools
      ['nmap', { requiresTarget: true }],
      ['masscan', { requiresTarget: true }],
      ['dig', { requiresTarget: true }],
      ['whois', { requiresTarget: true }],
      ['dirsearch', { requiresTarget: true }],
      ['sqlmap', { requiresTarget: true }],
      ['wfuzz', { requiresTarget: true }],
      ['ffuf', { requiresTarget: true }],
      ['nikto', { requiresTarget: true }],
      ['curl', { requiresTarget: true }],
      ['nc', { requiresTarget: true }],
      ['netcat', { requiresTarget: true }],
      ['tcptraceroute', { requiresTarget: true }],
      ['sslyze', { requiresTarget: true }],
      ['subfinder', { requiresTarget: true }],
      ['httpx', { requiresTarget: true }],
      ['naabu', { requiresTarget: true }],
      ['nuclei', { requiresTarget: true }],
      ['gobuster', { requiresTarget: true }],
      ['git-dumper', { requiresTarget: true }],
      ['rg', { requiresTarget: false }],
      // Common CLI (all run in container; no target required)
      ['ls', { requiresTarget: false }],
      ['cat', { requiresTarget: false }],
      ['head', { requiresTarget: false }],
      ['tail', { requiresTarget: false }],
      ['grep', { requiresTarget: false }],
      ['wc', { requiresTarget: false }],
      ['sort', { requiresTarget: false }],
      ['uniq', { requiresTarget: false }],
      ['pwd', { requiresTarget: false }],
      ['id', { requiresTarget: false }],
      ['whoami', { requiresTarget: false }],
      ['env', { requiresTarget: false }],
      ['base64', { requiresTarget: false }],
      ['xxd', { requiresTarget: false }],
      ['python3', { requiresTarget: false }],
      ['bash', { requiresTarget: false }],
      ['echo', { requiresTarget: false }],
      ['tr', { requiresTarget: false }],
      ['sed', { requiresTarget: false }],
      ['awk', { requiresTarget: false }],
      ['cut', { requiresTarget: false }],
      ['find', { requiresTarget: false }],
      ['file', { requiresTarget: false }],
      ['which', { requiresTarget: false }],
      ['whereis', { requiresTarget: false }],
      ['tesseract', { requiresTarget: false }],
      ['xclip', { requiresTarget: false }],
    ]);
  }

  /** Memory is in the DB when conversationId (passed as jobId) is set. File root is workspace only (no jobs/). */
  private getMemoryRoot(_jobId?: string): string {
    return this.getWorkspaceRoot();
  }

  private async getMemoryFiles(jobId?: string): Promise<string[]> {
    // Memory is one row per conversation, data = JSON { key: value }
    if (jobId) {
      const row = await this.memoryRepo.findOne({ where: { conversationId: jobId } });
      const data = (row?.data ?? {}) as Record<string, string>;
      return Object.keys(data).sort();
    }
    return ['main'];
  }

  private resolveMemoryPath(filePath: string, jobId?: string): string {
    if (filePath === 'SCOPE.md') {
      return this.resolveWorkspacePath('SCOPE.md', undefined);
    }
    if (filePath.startsWith('skills/')) {
      return this.resolveSkillsPath(filePath);
    }
    if (!this.isMemoryPath(filePath)) {
      throw new BadRequestException('path must be main, daily/YYYY-MM-DD, daily/website/YYYY-MM-DD, SCOPE.md, or skills/...');
    }
    // Memory paths are DB-only; no file path.
    throw new BadRequestException('Conversation memory is in the database only; use memory_get with path main, daily/YYYY-MM-DD, or daily/website/YYYY-MM-DD.');
  }

  /** Resolve path under workspace/skills/ (e.g. skills/recon/SKILL.md). Read-only. */
  private resolveSkillsPath(filePath: string): string {
    if (!filePath.startsWith('skills/')) {
      throw new BadRequestException('path must start with skills/ (e.g. skills/recon/SKILL.md)');
    }
    const workspace = this.getWorkspaceRoot();
    const resolved = path.resolve(workspace, filePath);
    const skillsRoot = path.resolve(workspace, 'skills');
    if (!resolved.startsWith(skillsRoot)) {
      throw new BadRequestException('path must be inside workspace/skills/');
    }
    return resolved;
  }

  private resolveWorkspacePath(filePath: string, jobId?: string): string {
    const base = this.getMemoryRoot(jobId);
    const resolved = path.resolve(base, filePath);
    if (!resolved.startsWith(base)) {
      throw new BadRequestException('path must be inside workspace');
    }
    return resolved;
  }

  private relativeWorkspacePath(filePath: string): string {
    const workspace = this.getWorkspaceRoot();
    return path.relative(workspace, filePath);
  }

  private relativeMemoryPath(filePath: string, jobId?: string): string {
    const root = this.getMemoryRoot(jobId);
    return path.relative(root, filePath);
  }

  private async readExistingFile(filePath: string, allowMissing: boolean = false): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      if (allowMissing) {
        return '';
      }
      throw new NotFoundException('File not found');
    }
  }

  private getWorkspaceRoot(): string {
    const configured = this.configService.get<string>('PENTEST_WORKSPACE');
    if (configured) {
      return path.resolve(configured);
    }
    return path.resolve(process.cwd(), 'skills');
  }

  /** Run a script in the payload sandbox (for craft_payload tool). */
  async runPayloadScript(script: string, timeoutMs?: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.payloadSandbox.runScript(script, timeoutMs);
  }
}
