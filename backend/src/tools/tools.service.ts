import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execFile, exec } from 'child_process';
import { promises as fs, existsSync, statSync } from 'fs';
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
      const content = await this.readSkillContent(filePath, true);
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
      // Install tools (run in container: apt-get, pip, npm). Use for installing missing pentest tools.
      ['apt-get', { requiresTarget: false }],
      ['apt', { requiresTarget: false }],
      ['pip', { requiresTarget: false }],
      ['pip3', { requiresTarget: false }],
      ['npm', { requiresTarget: false }],
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

  /**
   * Local directory for skills (e.g. /opt/skills). Check here first before CDN.
   * Set PENTEST_SKILLS_LOCAL_DIR to override; default /opt/skills.
   */
  private getSkillsLocalDir(): string {
    const dir = this.configService.get<string>('PENTEST_SKILLS_LOCAL_DIR');
    if (dir && dir.trim()) return path.resolve(dir.trim());
    return '/opt/skills';
  }

  /**
   * Base URL for skills on CDN (e.g. https://skills.gweh.sh). No trailing slash.
   * Same directory structure: path skills/AGENTS.md → URL {cdnBase}/skills/AGENTS.md.
   * Default https://skills.gweh.sh when not set.
   */
  private getSkillsCdnBase(): string | null {
    const base =
      this.configService.get<string>('PENTEST_SKILLS_CDN_URL')?.trim() || 'https://skills.gweh.sh';
    const trimmed = base.replace(/\/+$/, '');
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
    return trimmed;
  }

  /**
   * Read skill content: check local dir (/opt/skills) first; if not found, fetch from CDN
   * (https://skills.gweh.sh) and cache to local. Same path structure everywhere (skills/AGENTS.md, etc.).
   */
  private async readSkillContent(filePath: string, allowMissing: boolean): Promise<string> {
    if (!filePath.startsWith('skills/')) {
      throw new BadRequestException('path must start with skills/ (e.g. skills/recon/SKILL.md)');
    }
    const suffix = filePath.replace(/^skills\/?/, '');
    const localDir = this.getSkillsLocalDir();
    const localPath = path.join(localDir, suffix);

    // 1) Check local /opt/skills (or PENTEST_SKILLS_LOCAL_DIR) first
    if (existsSync(localPath) && statSync(localPath).isFile()) {
      return this.readExistingFile(localPath, allowMissing);
    }

    // 2) Not found locally: fetch from CDN (same path: cdnBase/skills/AGENTS.md)
    const cdnBase = this.getSkillsCdnBase();
    if (cdnBase) {
      const url = `${cdnBase}/${filePath}`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) {
          if (res.status === 404 && allowMissing) return '';
          throw new NotFoundException(`Skill not found: ${filePath} (${res.status})`);
        }
        const content = await res.text();
        // Cache to local so next load is from disk
        try {
          await fs.mkdir(path.dirname(localPath), { recursive: true });
          await fs.writeFile(localPath, content, 'utf8');
        } catch {
          // ignore cache write errors (e.g. read-only fs)
        }
        return content;
      } catch (err: any) {
        if (allowMissing && (err?.name === 'NotFoundError' || err?.message?.includes('404')))
          return '';
        throw err;
      }
    }

    // 3) No CDN: fallback to workspace/skills/
    const resolved = this.resolveSkillsPath(filePath);
    return this.readExistingFile(resolved, allowMissing);
  }

  /** Resolve path under workspace/skills/ (e.g. skills/recon/SKILL.md). Read-only. Used when CDN is not set or for add_skill (writes locally). */
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

  /**
   * Workspace root = directory that contains the "skills" folder (e.g. backend/ when skills are in backend/skills/).
   * In containers, set PENTEST_WORKSPACE to that directory (e.g. /app/backend) so skills load correctly.
   */
  private getWorkspaceRoot(): string {
    const configured = this.configService.get<string>('PENTEST_WORKSPACE');
    if (configured) {
      return path.resolve(configured);
    }
    const cwd = process.cwd();
    const cwdSkills = path.join(cwd, 'skills');
    if (existsSync(cwdSkills) && statSync(cwdSkills).isDirectory()) {
      return cwd;
    }
    // Fallback when run from compiled dist/ (e.g. dist/src/tools -> backend root is 2 levels up from dist)
    const thisDir = __dirname;
    const candidates = [
      path.resolve(thisDir, '..', '..'), // src/tools -> backend
      path.resolve(thisDir, '..', '..', '..'), // dist/src/tools -> dist; dist has no skills, backend does
      path.resolve(thisDir, '..', '..', '..', '..'), // dist/src/tools -> backend (if dist is backend/dist)
    ];
    for (const dir of candidates) {
      const skillsPath = path.join(dir, 'skills');
      if (existsSync(skillsPath) && statSync(skillsPath).isDirectory()) {
        return dir;
      }
    }
    return cwd;
  }

  /**
   * List available skill paths. Prefer local dir (/opt/skills or PENTEST_SKILLS_LOCAL_DIR);
   * if empty or missing, hint to use memory_get(skills/SKILLS_INDEX.md) or load by path (fetched from CDN on first use).
   */
  async listSkills(): Promise<{ paths: string[]; hint?: string }> {
    const localDir = this.getSkillsLocalDir();
    if (existsSync(localDir) && statSync(localDir).isDirectory()) {
      const paths: string[] = [];
      const walk = async (dir: string, relPrefix: string): Promise<void> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
          if (e.isDirectory()) {
            await walk(path.join(dir, e.name), rel);
          } else if (e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.txt'))) {
            paths.push(`skills/${rel}`);
          }
        }
      };
      await walk(localDir, '');
      paths.sort();
      return paths.length ? { paths } : { paths: [], hint: 'Local skills dir empty. Use memory_get(path: "skills/SKILLS_INDEX.md") or load by path; missing skills are downloaded from CDN (https://skills.gweh.sh) and cached to /opt/skills.' };
    }
    const workspace = this.getWorkspaceRoot();
    const skillsRoot = path.resolve(workspace, 'skills');
    if (existsSync(skillsRoot) && statSync(skillsRoot).isDirectory()) {
      const paths: string[] = [];
      const walk = async (dir: string, relPrefix: string): Promise<void> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
          if (e.isDirectory()) {
            await walk(path.join(dir, e.name), rel);
          } else if (e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.txt'))) {
            paths.push(`skills/${rel}`);
          }
        }
      };
      await walk(skillsRoot, '');
      paths.sort();
      return { paths };
    }
    return {
      paths: [],
      hint: 'Skills: check /opt/skills first; if missing, memory_get(path: "skills/...") downloads from CDN (https://skills.gweh.sh) and caches to /opt/skills. Use memory_get(path: "skills/SKILLS_INDEX.md") or skills/AGENTS.md for index.',
    };
  }

  /**
   * Download a skill by path: returns content for use or export. Path must start with skills/ (e.g. skills/recon/SKILL.md).
   */
  async downloadSkill(skillPath: string): Promise<{ path: string; content: string }> {
    if (!skillPath || !String(skillPath).trim().startsWith('skills/')) {
      throw new BadRequestException('path must start with skills/ (e.g. skills/recon/SKILL.md)');
    }
    const pathNorm = String(skillPath).trim();
    const content = await this.readSkillContent(pathNorm, false);
    return { path: pathNorm, content };
  }

  /**
   * Add a new skill under skills/custom/<name>/SKILL.md. Uses the same path resolution as memory_get so the skill can be loaded later.
   * Only allows creating under custom/ so core skills are not overwritten. Name is sanitized to a safe slug.
   */
  async addSkill(
    name: string,
    content: string,
    description?: string,
  ): Promise<{ ok: true; path: string; message: string }> {
    if (!name || !content) {
      throw new BadRequestException('name and content are required for add_skill');
    }
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');
    if (!slug) {
      throw new BadRequestException('name must contain at least one alphanumeric character');
    }
    const relativePath = `skills/custom/${slug}/SKILL.md`;
    const fullPath = this.resolveSkillsPath(relativePath);
    const customDir = path.resolve(this.getWorkspaceRoot(), 'skills', 'custom');
    if (!fullPath.startsWith(customDir)) {
      throw new BadRequestException('add_skill path must be under skills/custom/');
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const header = description
      ? `---
description: "${description.replace(/"/g, '\\"')}"
---
\n`
      : '';
    await fs.writeFile(fullPath, header + content.trimEnd() + '\n', 'utf8');
    return {
      ok: true,
      path: relativePath,
      message: `Skill created. Load it with memory_get(path: "${relativePath}").`,
    };
  }

  /**
   * Search GitHub/code via GitSearch API (e.g. wordlists, payloads, tools, examples).
   * Uses gitsearch-backend (e.g. gitsearchai.com) by default; optional api_url override.
   */
  async gitSearch(query: string, apiUrl?: string): Promise<{ results: unknown[]; raw?: string; error?: string }> {
    if (!query || !query.trim()) {
      throw new BadRequestException('query is required for git_search');
    }
    const url =
      apiUrl?.trim() ||
      this.configService.get<string>('GIT_SEARCH_API_URL') ||
      'https://gitsearch-backend-werv.onrender.com/api/search';
    const body = JSON.stringify({ query: query.trim() });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json',
          origin: 'https://www.gitsearchai.com',
          referer: 'https://www.gitsearchai.com/',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
          'x-session-auth': 'false',
          'x-session-id': `gwehai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const raw = await res.text();
      if (!res.ok) {
        return { results: [], raw: raw.slice(0, 2000), error: `HTTP ${res.status}` };
      }
      try {
        const data = JSON.parse(raw);
        const results = Array.isArray(data) ? data : data?.results ?? data?.data ?? data?.items ?? (data ? [data] : []);
        return { results };
      } catch {
        return { results: [], raw: raw.slice(0, 2000) };
      }
    } catch (err: unknown) {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : String(err);
      return { results: [], error: message };
    }
  }

  /** Run a script in the payload sandbox (for craft_payload tool). */
  async runPayloadScript(script: string, timeoutMs?: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.payloadSandbox.runScript(script, timeoutMs);
  }
}
