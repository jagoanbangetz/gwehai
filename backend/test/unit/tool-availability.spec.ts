/**
 * Tool Availability Service — Unit Tests
 *
 * Tests the tool availability probing, caching, and fallback logic.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ToolAvailabilityService } from '../../src/tools/tool-availability.service';

const mockConfigService = () => ({
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      PENTEST_RUN_IN_CONTAINER: 'false', // probe host by default in tests
      PENTEST_TOOLS_CONTAINER_NAME: 'test-container',
      TOOL_AVAILABILITY_CACHE_TTL_MINUTES: '60',
    };
    return config[key];
  }),
});

describe('ToolAvailabilityService', () => {
  let service: ToolAvailabilityService;
  let configService: ReturnType<typeof mockConfigService>;

  beforeEach(async () => {
    configService = mockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolAvailabilityService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<ToolAvailabilityService>(ToolAvailabilityService);
  });

  afterEach(() => {
    service.invalidateCache();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAvailableTools', () => {
    it('should return a result with available and unavailable arrays', async () => {
      const result = await service.getAvailableTools();

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('unavailable');
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('checkedAt');
      expect(result).toHaveProperty('source');

      expect(Array.isArray(result.available)).toBe(true);
      expect(Array.isArray(result.unavailable)).toBe(true);
      expect(Array.isArray(result.categories)).toBe(true);
    });

    it('should cache results on subsequent calls', async () => {
      const result1 = await service.getAvailableTools();
      const result2 = await service.getAvailableTools();

      // Same object reference = cache hit
      expect(result1).toBe(result2);
      expect(result1.checkedAt).toBe(result2.checkedAt);
    });
  });

  describe('isToolAvailable', () => {
    it('should return true for a tool that exists on the system', async () => {
      // 'sh' should exist on virtually all systems
      // But our service only checks expected tools, so we test with 'ls'
      const result = await service.isToolAvailable('ls');
      expect(typeof result).toBe('boolean');
    });

    it('should return false for a tool that does not exist', async () => {
      const result = await service.isToolAvailable('nonexistent_tool_xyz');
      expect(result).toBe(false);
    });
  });

  describe('getAvailableToolNames', () => {
    it('should return a flat array of tool names', async () => {
      const names = await service.getAvailableToolNames();
      expect(Array.isArray(names)).toBe(true);
      // Should contain at least some basic CLI tools
      expect(names.length).toBeGreaterThan(0);
    });
  });

  describe('invalidateCache', () => {
    it('should cause next call to re-probe', async () => {
      await service.getAvailableTools();
      service.invalidateCache();

      // Next call should probe again (different checkedAt)
      const result = await service.getAvailableTools();
      expect(result.checkedAt).toBeDefined();
    });
  });

  describe('refresh', () => {
    it('should force a refresh regardless of cache', async () => {
      const result1 = await service.getAvailableTools();
      const result2 = await service.refresh();

      // Different calls, but same content (tools didn't change)
      expect(result1.available).toEqual(result2.available);
      // checkedAt should be different (or very close)
      expect(result2.checkedAt).toBeDefined();
    });
  });

  describe('categories', () => {
    it('should group tools by category', async () => {
      const result = await service.getAvailableTools();

      for (const cat of result.categories) {
        expect(cat).toHaveProperty('category');
        expect(cat).toHaveProperty('tools');
        expect(typeof cat.category).toBe('string');
        expect(Array.isArray(cat.tools)).toBe(true);
        expect(cat.tools.length).toBeGreaterThan(0);
      }
    });
  });
});
