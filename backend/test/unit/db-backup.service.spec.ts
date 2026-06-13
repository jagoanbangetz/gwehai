import { DbBackupService } from '../../src/admin/db-backup.service';
import { HttpException } from '@nestjs/common';

// Mock child_process
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

// Mock fs
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn().mockReturnValue([]),
    statSync: jest.fn().mockReturnValue({ size: 1024, mtime: new Date() }),
    unlinkSync: jest.fn(),
  };
});

import { execFile } from 'child_process';
import * as fs from 'fs';

describe('DbBackupService', () => {
  let service: DbBackupService;
  const configService = {
    get: jest.fn((key: string, def: any) => {
      const map: Record<string, any> = {
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_USERNAME: 'gwehai',
        DB_PASSWORD: 'test_pass',
        DB_DATABASE: 'gwehai_db',
      };
      return map[key] ?? def;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DbBackupService(configService as any);
  });

  describe('createBackup', () => {
    it('should create a backup successfully', async () => {
      (execFile as unknown as jest.Mock).mockImplementation(
        (cmd: string, args: string[], opts: any, cb: Function) => {
          if (typeof opts === 'function') { cb = opts; }
          cb(null, '', '');
        },
      );
      (fs.statSync as jest.Mock).mockReturnValue({ size: 2048, mtime: new Date() });

      const result = await service.createBackup();

      expect(result.filename).toMatch(/^backup-.*\.sql\.gz$/);
      expect(result.size).toBe(2048);
      expect(result.timestamp).toBeDefined();
      expect(execFile).toHaveBeenCalledWith(
        'pg_dump',
        expect.arrayContaining(['-d', 'gwehai_db', '--no-owner', '--no-acl', '-F', 'c']),
        expect.objectContaining({ timeout: 300_000 }),
        expect.any(Function),
      );
    });

    it('should rate limit backups', async () => {
      // First backup succeeds
      (execFile as unknown as jest.Mock).mockImplementation(
        (cmd: string, args: string[], opts: any, cb: Function) => {
          if (typeof opts === 'function') { cb = opts; }
          cb(null, '', '');
        },
      );
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      await service.createBackup();

      // Second backup should be rate limited
      await expect(service.createBackup()).rejects.toThrow(HttpException);
    });

    it('should handle pg_dump failure', async () => {
      // Reset rate limiter
      (service as any).lastBackupTime = 0;

      (execFile as unknown as jest.Mock).mockImplementation(
        (cmd: string, args: string[], opts: any, cb: Function) => {
          if (typeof opts === 'function') { cb = opts; }
          cb(new Error('connection refused'), '', 'connection refused');
        },
      );

      await expect(service.createBackup()).rejects.toThrow(HttpException);
    });
  });

  describe('listBackups', () => {
    it('should list backups newest first', () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        'backup-2026-01-01T00-00-00.sql.gz',
        'backup-2026-06-01T00-00-00.sql.gz',
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });

      const result = service.listBackups();

      expect(result).toHaveLength(2);
      expect(result[0].filename).toBe('backup-2026-06-01T00-00-00.sql.gz');
      expect(result[1].filename).toBe('backup-2026-01-01T00-00-00.sql.gz');
    });

    it('should return empty array when no backups exist', () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      expect(service.listBackups()).toEqual([]);
    });
  });

  describe('generateRestoreToken', () => {
    it('should generate a token for an existing backup', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = service.generateRestoreToken('backup-test.sql.gz');

      expect(result.token).toHaveLength(64); // 32 bytes hex
      expect(result.expiresAt).toBeDefined();
    });

    it('should reject non-existent backup file', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      expect(() => service.generateRestoreToken('nonexistent.sql.gz')).toThrow(HttpException);
    });
  });

  describe('restoreBackup', () => {
    it('should reject invalid token', async () => {
      await expect(service.restoreBackup('invalid-token')).rejects.toThrow(HttpException);
    });

    it('should restore with valid token', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (execFile as unknown as jest.Mock).mockImplementation(
        (cmd: string, args: string[], opts: any, cb: Function) => {
          if (typeof opts === 'function') { cb = opts; }
          cb(null, '', '');
        },
      );

      const { token } = service.generateRestoreToken('backup-test.sql.gz');
      const result = await service.restoreBackup(token);

      expect(result.message).toBe('Database restored successfully');
      expect(result.filename).toBe('backup-test.sql.gz');
      expect(execFile).toHaveBeenCalledWith(
        'pg_restore',
        expect.arrayContaining(['-d', 'gwehai_db', '--clean', '--if-exists']),
        expect.objectContaining({ timeout: 600_000 }),
        expect.any(Function),
      );
    });

    it('should reject reused token (one-time use)', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (execFile as unknown as jest.Mock).mockImplementation(
        (cmd: string, args: string[], opts: any, cb: Function) => {
          if (typeof opts === 'function') { cb = opts; }
          cb(null, '', '');
        },
      );

      const { token } = service.generateRestoreToken('backup-test.sql.gz');
      await service.restoreBackup(token);

      // Second attempt with same token should fail
      await expect(service.restoreBackup(token)).rejects.toThrow('Invalid or expired');
    });
  });
});
