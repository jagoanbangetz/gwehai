import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface RunScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Sandbox for payload/code crafting. Scripts run in a dedicated directory
 * (workspace/payloads) so the AI can generate and execute small scripts
 * (e.g. bash, Python one-liners) safely without touching the rest of the fs.
 * Can later use @mariozechner/pi-coding-agent createBashTool/createWriteTool
 * with this same cwd when using pi-agent-core.
 */
@Injectable()
export class PayloadSandboxService {
  constructor(private readonly configService: ConfigService) {}

  /** When true, run scripts inside the pentest-tools container via docker exec -i. */
  private getRunInContainer(): boolean {
    const v = this.configService.get<string>('PENTEST_RUN_IN_CONTAINER');
    if (v === 'false' || v === '0' || v === 'no') return false;
    return v === 'true' || v === '1' || v === 'yes' || v === undefined;
  }

  private getToolsContainerName(): string {
    const name = this.configService.get<string>('PENTEST_TOOLS_CONTAINER_NAME');
    return name?.trim() || 'gwehai-pentest-tools';
  }

  /** Root of the sandbox (e.g. workspace/payloads). */
  getSandboxDir(): string {
    const workspace = this.getWorkspaceRoot();
    return path.join(workspace, 'payloads');
  }

  private getWorkspaceRoot(): string {
    const configured = this.configService.get<string>('PENTEST_WORKSPACE');
    if (configured) {
      return path.resolve(configured);
    }
    return path.resolve(process.cwd(), 'skills');
  }

  /**
   * Ensure sandbox dir exists and is a directory.
   */
  async ensureSandbox(): Promise<string> {
    const dir = this.getSandboxDir();
    await fs.mkdir(dir, { recursive: true });
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      throw new BadRequestException('Payload sandbox path is not a directory');
    }
    return dir;
  }

  /**
   * Run a script in the sandbox. When PENTEST_RUN_IN_CONTAINER is true, runs inside the
   * pentest-tools container via docker exec -i (script piped to bash). Otherwise writes
   * to a temp file on host and runs with bash. Returns stdout, stderr, and exit code.
   */
  async runScript(script: string, timeoutMs: number = 30_000): Promise<RunScriptResult> {
    if (!script || !script.trim()) {
      throw new BadRequestException('script is required');
    }
    const runInContainer = this.getRunInContainer();
    const containerName = this.getToolsContainerName();

    if (runInContainer && containerName) {
      return this.runScriptInContainer(script.trimEnd() + '\n', containerName, timeoutMs);
    }

    const sandbox = await this.ensureSandbox();
    const tempName = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.sh`;
    const tempPath = path.join(sandbox, tempName);
    try {
      await fs.writeFile(tempPath, script.trimEnd() + '\n', { mode: 0o700 });
    } catch (e) {
      throw new BadRequestException(`Failed to write script: ${(e as Error).message}`);
    }
    try {
      const { stdout, stderr } = await execAsync(`bash "${tempPath}"`, {
        cwd: sandbox,
        timeout: timeoutMs,
        maxBuffer: 512 * 1024,
      });
      return {
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0,
      };
    } catch (err: any) {
      const stdout = err.stdout ?? '';
      const stderr = err.stderr ?? '';
      const exitCode = err.code ?? 1;
      return {
        stdout: String(stdout),
        stderr: String(stderr).trim() || `Command exited with code ${exitCode}`,
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
      };
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  /**
   * Run script inside the pentest-tools container: pipe script to docker exec -i <container> bash.
   */
  private runScriptInContainer(script: string, containerName: string, timeoutMs: number): Promise<RunScriptResult> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: RunScriptResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        finish({
          stdout: '',
          stderr: `Command timed out after ${timeoutMs}ms`,
          exitCode: 124,
        });
      }, timeoutMs);

      const proc = spawn('docker', ['exec', '-i', containerName, 'bash'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (chunk) => { stdout += String(chunk); });
      proc.stderr?.on('data', (chunk) => { stderr += String(chunk); });
      proc.on('error', (err) => {
        finish({
          stdout: '',
          stderr: err.message || 'Failed to run docker exec',
          exitCode: 1,
        });
      });
      proc.on('close', (code, signal) => {
        if (settled) return;
        const exitCode = code ?? (signal ? 1 : 0);
        finish({
          stdout,
          stderr: stderr.trim() || (exitCode !== 0 ? `Command exited with code ${exitCode}` : ''),
          exitCode: typeof exitCode === 'number' ? exitCode : 1,
        });
      });
      if (proc.stdin) {
        proc.stdin.write(script, (err) => {
          if (err) finish({ stdout: '', stderr: err.message, exitCode: 1 });
          else proc.stdin?.end();
        });
      } else {
        finish({ stdout: '', stderr: 'No stdin', exitCode: 1 });
      }
    });
  }
}
