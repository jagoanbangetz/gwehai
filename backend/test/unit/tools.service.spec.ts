import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ToolsService } from '../../src/tools/tools.service';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

jest.mock('typeorm', () => ({
  Repository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../src/entities/conversation-memory.entity', () => ({
  ConversationMemory: {},
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
  execFile: jest.fn(),
}));

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    readdir: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
  },
}));

describe('ToolsService', () => {
  const workspaceRoot = '/workspace';
  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;
  const conversationId = 'conv-123';
  const memoryRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    save: jest.fn(),
  } as any;

  const payloadSandbox = {
    runScript: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  } as any;

  let service: ToolsService;

  beforeEach(() => {
    jest.resetAllMocks();
    configService.get = jest.fn().mockReturnValue(workspaceRoot);
    memoryRepo.find.mockResolvedValue([]);
    memoryRepo.findOne.mockResolvedValue(null);
    payloadSandbox.runScript.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    service = new ToolsService(configService, memoryRepo, payloadSandbox);
  });

  describe('memory (database)', () => {
    it('memorySearch with jobId returns snippets from database', async () => {
      memoryRepo.findOne.mockResolvedValue({
        conversationId,
        data: { main: 'alpha\nbeta\n', 'daily/2026-02-08': 'gamma\nbeta match\n' },
      });

      const results = await service.memorySearch('beta', 10, conversationId);

      expect(memoryRepo.findOne).toHaveBeenCalledWith({ where: { conversationId } });
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ path: 'main', snippet: 'beta' });
      expect(results[1]).toMatchObject({ path: 'daily/2026-02-08', snippet: 'beta match' });
    });

    it('memorySearch without jobId throws BadRequestException', async () => {
      await expect(service.memorySearch('beta', 10)).rejects.toThrow(BadRequestException);
      await expect(service.memorySearch('beta', 10)).rejects.toThrow(/Conversation context|jobId/);
      expect(memoryRepo.findOne).not.toHaveBeenCalled();
    });

    it('memoryGet for main with jobId returns content from database', async () => {
      memoryRepo.findOne.mockResolvedValue({
        conversationId,
        data: { main: 'one\ntwo\nthree\nfour\n' },
      });

      const content = await service.memoryGet('main', 2, 2, conversationId);

      expect(memoryRepo.findOne).toHaveBeenCalledWith({ where: { conversationId } });
      expect(content).toBe('two\nthree');
    });

    it('memoryGet for MEMORY.md with jobId normalizes to main', async () => {
      memoryRepo.findOne.mockResolvedValue({
        conversationId,
        data: { main: 'one\ntwo\nthree\nfour\n' },
      });

      const content = await service.memoryGet('MEMORY.md', 2, 2, conversationId);

      expect(content).toBe('two\nthree');
    });

    it('memoryGet for main without jobId throws BadRequestException', async () => {
      await expect(service.memoryGet('main')).rejects.toThrow(BadRequestException);
      await expect(service.memoryGet('main')).rejects.toThrow(/Conversation context|jobId/);
      expect(memoryRepo.findOne).not.toHaveBeenCalled();
    });

    it('memoryGet for daily path with jobId returns content from database', async () => {
      memoryRepo.findOne.mockResolvedValue({
        conversationId,
        data: { 'daily/2026-02-09': 'session notes' },
      });

      const content = await service.memoryGet('daily/2026-02-09', undefined, undefined, conversationId);

      expect(memoryRepo.findOne).toHaveBeenCalledWith({ where: { conversationId } });
      expect(content).toBe('session notes');
    });

    it('writeFile with jobId creates new row in database', async () => {
      memoryRepo.findOne.mockResolvedValue(null);
      const created = { id: 'id-1', conversationId, data: { main: 'hello' } };
      memoryRepo.create.mockReturnValue(created);
      memoryRepo.save.mockResolvedValue(created);

      const result = await service.writeFile('main', 'hello', false, conversationId);

      expect(memoryRepo.findOne).toHaveBeenCalledWith({ where: { conversationId } });
      expect(memoryRepo.save).toHaveBeenCalled();
      expect(result).toEqual({ ok: true, path: 'main' });
    });

    it('writeFile with jobId and append updates existing row in database', async () => {
      const existing = { id: 'id-1', conversationId, data: { main: 'existing' } };
      memoryRepo.findOne.mockResolvedValue(existing);
      memoryRepo.save.mockResolvedValue(existing);

      const result = await service.writeFile('main', 'appended', true, conversationId);

      expect(memoryRepo.findOne).toHaveBeenCalledWith({ where: { conversationId } });
      expect(existing.data.main).toBe('existing\nappended');
      expect(memoryRepo.save).toHaveBeenCalledWith(existing);
      expect(result).toEqual({ ok: true, path: 'main' });
    });

    it('writeFile for memory path without jobId throws BadRequestException', async () => {
      await expect(
        service.writeFile('main', 'hello', false),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.writeFile('main', 'hello', false),
      ).rejects.toThrow(/Conversation context|jobId|Memory is stored/);

      expect(memoryRepo.create).not.toHaveBeenCalled();
      expect(memoryRepo.save).not.toHaveBeenCalled();
    });
  });

  it('rejects memory_get for non-memory paths', async () => {
    await expect(service.memoryGet('notes.txt')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects write_file for non-memory paths', async () => {
    await expect(
      service.writeFile('notes.txt', 'hello'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('runPayloadScript delegates to payload sandbox', async () => {
    payloadSandbox.runScript.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });

    const result = await service.runPayloadScript('echo ok');

    expect(payloadSandbox.runScript).toHaveBeenCalledWith('echo ok', undefined);
    expect(result).toEqual({ stdout: 'ok', stderr: '', exitCode: 0 });
  });

  it('executes allowlisted command when target is provided', async () => {
    (execFile as unknown as jest.Mock).mockImplementation(
      (_cmd: string, _args: string[], _opts: any, cb: any) =>
        cb(null, 'ok', ''),
    );

    const result = await service.execCommand({
      command: 'nmap',
      args: ['-sV', 'example.com'],
      target: 'https://example.com',
    });

    expect(result.stdout).toBe('ok');
    expect(execFile).toHaveBeenCalled();
  });

  it('rejects exec when command is not allowlisted', async () => {
    await expect(
      service.execCommand({ command: 'rm', args: ['-rf', '/'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects exec when target is required but missing', async () => {
    await expect(
      service.execCommand({
        command: 'nmap',
        args: ['-sV', 'example.com'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.execCommand({
        command: 'nmap',
        args: ['-sV', 'example.com'],
      }),
    ).rejects.toThrow(/target is required/);
  });
});
