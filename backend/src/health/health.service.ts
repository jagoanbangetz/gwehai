import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { execSync } from 'child_process';
import * as os from 'os';
import * as net from 'net';

export type CheckStatus = 'ok' | 'degraded' | 'down';

export interface ComponentCheck {
  status: CheckStatus;
  latency_ms?: number;
  usage_percent?: number;
  message?: string;
}

export interface HealthResponse {
  status: CheckStatus;
  timestamp: string;
  checks: {
    db: ComponentCheck;
    redis: ComponentCheck;
    disk: ComponentCheck;
    memory: ComponentCheck;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async check(): Promise<HealthResponse> {
    const [db, redis, disk, memory] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkDisk(),
      this.checkMemory(),
    ]);

    const checks = { db, redis, disk, memory };

    // Overall status logic:
    // - "down" if DB is down (critical dependency)
    // - "degraded" if any non-critical check is unhealthy
    // - "ok" if everything is fine
    let status: CheckStatus = 'ok';
    if (db.status === 'down') {
      status = 'down';
    } else if (
      redis.status === 'down' ||
      disk.status === 'degraded' ||
      memory.status === 'degraded'
    ) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkDatabase(): Promise<ComponentCheck> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      const latency = Date.now() - start;
      return {
        status: 'ok',
        latency_ms: latency,
      };
    } catch (err: any) {
      this.logger.error(`DB health check failed: ${err.message}`);
      return {
        status: 'down',
        latency_ms: Date.now() - start,
        message: 'Database connection failed',
      };
    }
  }

  private async checkRedis(): Promise<ComponentCheck> {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    // Skip if explicitly disabled
    if (process.env.REDIS_ENABLED === 'false') {
      return { status: 'ok', message: 'Redis not configured' };
    }

    return new Promise((resolve) => {
      const timeout = 3000;
      const start = Date.now();
      const socket = new net.Socket();

      const timer = setTimeout(() => {
        socket.destroy();
        resolve({
          status: 'down',
          latency_ms: Date.now() - start,
          message: `Redis connection timeout (${host}:${port})`,
        });
      }, timeout);

      socket.connect(port, host, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({
          status: 'ok',
          latency_ms: Date.now() - start,
        });
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        socket.destroy();
        this.logger.warn(`Redis health check failed: ${err.message}`);
        resolve({
          status: 'down',
          latency_ms: Date.now() - start,
          message: `Redis unreachable (${host}:${port})`,
        });
      });
    });
  }

  private checkDisk(): ComponentCheck {
    try {
      const output = execSync("df -h / | tail -1 | awk '{print $5}'", {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      const usagePercent = parseInt(output.replace('%', ''), 10);

      if (isNaN(usagePercent)) {
        return { status: 'ok', usage_percent: 0, message: 'Could not parse disk usage' };
      }

      return {
        status: usagePercent >= 90 ? 'degraded' : 'ok',
        usage_percent: usagePercent,
        ...(usagePercent >= 90 && { message: 'Disk usage critical' }),
      };
    } catch (err: any) {
      this.logger.warn(`Disk health check failed: ${err.message}`);
      return { status: 'ok', message: 'Disk check unavailable' };
    }
  }

  private checkMemory(): ComponentCheck {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

      return {
        status: usedPercent >= 90 ? 'degraded' : 'ok',
        usage_percent: usedPercent,
        ...(usedPercent >= 90 && { message: 'Memory usage critical' }),
      };
    } catch (err: any) {
      this.logger.warn(`Memory health check failed: ${err.message}`);
      return { status: 'ok', message: 'Memory check unavailable' };
    }
  }
}
