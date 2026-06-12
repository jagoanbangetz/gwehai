/**
 * Tool Availability Service
 *
 * Probes the pentest-tools container (or host) to check which CLI tools
 * are actually installed and runnable. Caches results with a configurable TTL
 * (default 1 hour) so we don't spam `which` every request.
 *
 * Used by:
 * - GET /tools/available endpoint → frontend or agent can query available tools
 * - PromptManagerService → injects available tool list into system prompt
 * - ToolExecutorService → pre-check before exec to gracefully reject missing tools
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Tool categories for structured output. */
export interface ToolCategory {
  category: string;
  tools: string[];
}

/** Full availability result. */
export interface ToolAvailabilityResult {
  available: string[];
  unavailable: string[];
  categories: ToolCategory[];
  checkedAt: string;
  source: 'container' | 'host';
}

@Injectable()
export class ToolAvailabilityService {
  private readonly logger = new Logger(ToolAvailabilityService.name);

  /** Cached availability result. */
  private cache: ToolAvailabilityResult | null = null;

  /** Timestamp of last cache refresh (ms). */
  private cacheTimestamp = 0;

  /** Cache TTL in ms. Default 1 hour. */
  private readonly cacheTtlMs: number;

  /**
   * All tools we expect to be available in the pentest-tools container.
   * Split by category for structured output.
   */
  private static readonly EXPECTED_TOOLS: ToolCategory[] = [
    {
      category: 'pentest',
      tools: ['nmap', 'masscan', 'dig', 'whois', 'nikto', 'sqlmap', 'ffuf', 'gobuster', 'sslyze', 'subfinder', 'httpx', 'naabu', 'nuclei', 'git-dumper'],
    },
    {
      category: 'network',
      tools: ['curl', 'nc', 'netcat', 'tcptraceroute'],
    },
    {
      category: 'browser',
      tools: ['node'],
    },
    {
      category: 'cli',
      tools: ['rg', 'ls', 'cat', 'head', 'tail', 'grep', 'wc', 'sort', 'uniq', 'find', 'file', 'which'],
    },
    {
      category: 'runtimes',
      tools: ['python3', 'node', 'bash'],
    },
    {
      category: 'install',
      tools: ['apt-get', 'apt', 'pip', 'pip3', 'npm'],
    },
  ];

  /** Flat list of all expected tools (deduplicated). */
  private static readonly ALL_EXPECTED_TOOLS: string[] = [
    ...new Set(ToolAvailabilityService.EXPECTED_TOOLS.flatMap((c) => c.tools)),
  ];

  constructor(private readonly configService: ConfigService) {
    const ttlMinutes = Number(this.configService.get('TOOL_AVAILABILITY_CACHE_TTL_MINUTES')) || 60;
    this.cacheTtlMs = ttlMinutes * 60 * 1000;
  }

  /**
   * Get available tools. Returns cached result if fresh; otherwise probes.
   */
  async getAvailableTools(): Promise<ToolAvailabilityResult> {
    if (this.cache && Date.now() - this.cacheTimestamp < this.cacheTtlMs) {
      return this.cache;
    }
    return this.refresh();
  }

  /**
   * Force-refresh the availability cache. Called on container restart or TTL expiry.
   */
  async refresh(): Promise<ToolAvailabilityResult> {
    const runInContainer = this.getRunInContainer();
    const containerName = this.getToolsContainerName();

    try {
      if (runInContainer && containerName) {
        const result = await this.probeContainer(containerName);
        this.cache = result;
        this.cacheTimestamp = Date.now();
        this.logger.log(`Tool availability refreshed (container): ${result.available.length} available, ${result.unavailable.length} unavailable`);
        return result;
      }
    } catch (err: any) {
      this.logger.warn(`Container probe failed, falling back to host: ${err?.message || err}`);
    }

    // Fallback: probe host
    const result = await this.probeHost();
    this.cache = result;
    this.cacheTimestamp = Date.now();
    this.logger.log(`Tool availability refreshed (host): ${result.available.length} available, ${result.unavailable.length} unavailable`);
    return result;
  }

  /**
   * Check if a specific tool is available. O(1) lookup on cached set.
   */
  async isToolAvailable(toolName: string): Promise<boolean> {
    const result = await this.getAvailableTools();
    return result.available.includes(toolName);
  }

  /**
   * Get just the flat list of available tool names (for prompt injection).
   */
  async getAvailableToolNames(): Promise<string[]> {
    const result = await this.getAvailableTools();
    return result.available;
  }

  /**
   * Invalidate the cache. Called when container restarts or tools are installed.
   */
  invalidateCache(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
    this.logger.log('Tool availability cache invalidated');
  }

  // ─── Private Probing Methods ─────────────────────────────────────────

  /**
   * Probe the Docker container: `docker exec <container> which <tool>` for each expected tool.
   * Runs checks in parallel batches for speed.
   */
  private async probeContainer(containerName: string): Promise<ToolAvailabilityResult> {
    const available: string[] = [];
    const unavailable: string[] = [];

    // Batch `which` checks — run all in one shell command for speed
    const allTools = ToolAvailabilityService.ALL_EXPECTED_TOOLS;
    const checkScript = allTools.map((t) => `command -v ${t} >/dev/null 2>&1 && echo "Y:${t}" || echo "N:${t}"`).join('; ');

    try {
      const { stdout } = await execFileAsync('docker', [
        'exec', containerName, 'sh', '-c', checkScript,
      ], { timeout: 15000 });

      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Y:')) {
          available.push(trimmed.slice(2));
        } else if (trimmed.startsWith('N:')) {
          unavailable.push(trimmed.slice(2));
        }
      }
    } catch (err: any) {
      this.logger.error(`Container probe exec failed: ${err?.message || err}`);
      throw err;
    }

    return this.buildResult(available, unavailable, 'container');
  }

  /**
   * Probe the host directly (when PENTEST_RUN_IN_CONTAINER=false).
   */
  private async probeHost(): Promise<ToolAvailabilityResult> {
    const available: string[] = [];
    const unavailable: string[] = [];
    const allTools = ToolAvailabilityService.ALL_EXPECTED_TOOLS;

    // Check all tools in one shell command
    const checkScript = allTools.map((t) => `command -v ${t} >/dev/null 2>&1 && echo "Y:${t}" || echo "N:${t}"`).join('; ');

    try {
      const { stdout } = await execFileAsync('sh', ['-c', checkScript], { timeout: 10000 });
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Y:')) {
          available.push(trimmed.slice(2));
        } else if (trimmed.startsWith('N:')) {
          unavailable.push(trimmed.slice(2));
        }
      }
    } catch (err: any) {
      this.logger.error(`Host probe failed: ${err?.message || err}`);
      // Fallback: assume all expected tools are available (static allowlist)
      return this.buildResult(allTools, [], 'host');
    }

    return this.buildResult(available, unavailable, 'host');
  }

  /**
   * Build structured result with categories.
   */
  private buildResult(available: string[], unavailable: string[], source: 'container' | 'host'): ToolAvailabilityResult {
    const availableSet = new Set(available);
    const categories: ToolCategory[] = ToolAvailabilityService.EXPECTED_TOOLS.map((cat) => ({
      category: cat.category,
      tools: cat.tools.filter((t) => availableSet.has(t)),
    })).filter((c) => c.tools.length > 0);

    return {
      available,
      unavailable,
      categories,
      checkedAt: new Date().toISOString(),
      source,
    };
  }

  // ─── Config Helpers ──────────────────────────────────────────────────

  private getRunInContainer(): boolean {
    const v = this.configService.get<string>('PENTEST_RUN_IN_CONTAINER');
    if (v === 'false' || v === '0' || v === 'no') return false;
    return v === 'true' || v === '1' || v === 'yes' || v === undefined;
  }

  private getToolsContainerName(): string | null {
    const name = this.configService.get<string>('PENTEST_TOOLS_CONTAINER_NAME');
    return name?.trim() || 'gwehai-pentest-tools';
  }
}
