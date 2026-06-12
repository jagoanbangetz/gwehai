import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const execFileAsync = promisify(execFile);

export interface BackupMeta {
  filename: string;
  size: number;
  timestamp: string;
}

const BACKUP_DIR = process.env.DB_BACKUP_DIR || '/tmp/gwehai-db-backups';
const MAX_BACKUPS = 5;
const RATE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const RESTORE_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class DbBackupService {
  private readonly logger = new Logger(DbBackupService.name);
  private lastBackupTime = 0;
  private pendingRestoreTokens = new Map<string, { filename: string; expires: number }>();

  constructor(private readonly configService: ConfigService) {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  private getDbEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PGHOST: this.configService.get<string>('DB_HOST', 'localhost'),
      PGPORT: String(this.configService.get<number>('DB_PORT', 5432)),
      PGUSER: this.configService.get<string>('DB_USERNAME', 'gwehai'),
      PGPASSWORD: this.configService.get<string>('DB_PASSWORD', 'gwehai_dev_password'),
      PGDATABASE: this.configService.get<string>('DB_DATABASE', 'gwehai_db'),
    };
  }

  private getDbName(): string {
    return this.configService.get<string>('DB_DATABASE', 'gwehai_db');
  }

  /**
   * Create a pg_dump backup of the database.
   */
  async createBackup(): Promise<BackupMeta> {
    const now = Date.now();
    if (now - this.lastBackupTime < RATE_LIMIT_MS) {
      const waitMin = Math.ceil((RATE_LIMIT_MS - (now - this.lastBackupTime)) / 60000);
      throw new HttpException(
        `Rate limited. Wait ${waitMin} minute(s) before creating another backup.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup-${timestamp}.sql.gz`;
    const filepath = path.join(BACKUP_DIR, filename);

    this.logger.log(`Starting backup: ${filename}`);

    try {
      await execFileAsync('pg_dump', [
        '-d', this.getDbName(),
        '--no-owner',
        '--no-acl',
        '-F', 'c',       // custom format (compressed)
        '-f', filepath,
      ], {
        env: this.getDbEnv(),
        timeout: 300_000, // 5 min
      });
    } catch (err: any) {
      this.logger.error(`Backup failed: ${err.stderr || err.message}`);
      try { fs.unlinkSync(filepath); } catch {}
      throw new HttpException(
        `Backup failed: ${err.stderr || err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const stats = fs.statSync(filepath);
    this.lastBackupTime = now;

    this.logger.log(`Backup complete: ${filename} (${stats.size} bytes)`);

    await this.pruneOldBackups();

    return {
      filename,
      size: stats.size,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * List existing backups, newest first.
   */
  listBackups(): BackupMeta[] {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.sql.gz'))
      .sort()
      .reverse();

    return files.map((filename) => {
      const filepath = path.join(BACKUP_DIR, filename);
      const stats = fs.statSync(filepath);
      return {
        filename,
        size: stats.size,
        timestamp: stats.mtime.toISOString(),
      };
    });
  }

  /**
   * Generate a one-time confirmation token for restore (expires in 5 min).
   */
  generateRestoreToken(filename: string): { token: string; expiresAt: string } {
    const filepath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filepath)) {
      throw new HttpException('Backup file not found', HttpStatus.NOT_FOUND);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + RESTORE_TOKEN_TTL_MS;

    this.pendingRestoreTokens.set(token, { filename, expires });

    // Cleanup expired tokens
    for (const [key, val] of this.pendingRestoreTokens) {
      if (val.expires < Date.now()) this.pendingRestoreTokens.delete(key);
    }

    return { token, expiresAt: new Date(expires).toISOString() };
  }

  /**
   * Restore database from backup using a valid confirmation token.
   */
  async restoreBackup(token: string): Promise<{ message: string; filename: string }> {
    const pending = this.pendingRestoreTokens.get(token);
    if (!pending || pending.expires < Date.now()) {
      if (pending) this.pendingRestoreTokens.delete(token);
      throw new HttpException('Invalid or expired confirmation token', HttpStatus.BAD_REQUEST);
    }

    const { filename } = pending;
    const filepath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(filepath)) {
      this.pendingRestoreTokens.delete(token);
      throw new HttpException('Backup file no longer exists', HttpStatus.NOT_FOUND);
    }

    // Consume the token (one-time use)
    this.pendingRestoreTokens.delete(token);

    this.logger.warn(`RESTORE starting from: ${filename} — overwriting current DB!`);

    try {
      await execFileAsync('pg_restore', [
        '-d', this.getDbName(),
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
        filepath,
      ], {
        env: this.getDbEnv(),
        timeout: 600_000, // 10 min
      });
    } catch (err: any) {
      this.logger.error(`Restore failed: ${err.stderr || err.message}`);
      throw new HttpException(
        `Restore failed: ${err.stderr || err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.warn(`Restore complete from: ${filename}`);

    return {
      message: 'Database restored successfully',
      filename,
    };
  }

  /**
   * Remove oldest backups beyond MAX_BACKUPS.
   */
  private async pruneOldBackups(): Promise<void> {
    const backups = this.listBackups(); // newest first
    if (backups.length <= MAX_BACKUPS) return;

    const toDelete = backups.slice(MAX_BACKUPS);
    for (const b of toDelete) {
      const filepath = path.join(BACKUP_DIR, b.filename);
      try {
        fs.unlinkSync(filepath);
        this.logger.log(`Pruned old backup: ${b.filename}`);
      } catch (err: any) {
        this.logger.warn(`Failed to prune ${b.filename}: ${err.message}`);
      }
    }
  }
}
