/**
 * UploadsController — Unit Tests
 *
 * Tests path traversal protection:
 * - Sanitized filename handling
 * - Path traversal rejection
 * - Valid file serving
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import * as path from 'path';
import * as fs from 'fs';

// Mock fs and sendFile
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('UploadsController', () => {
  let controller: UploadsController;
  let mockRes: any;
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
    }).compile();

    controller = module.get<UploadsController>(UploadsController);

    mockRes = {
      setHeader: jest.fn(),
      sendFile: jest.fn(),
    };

    // Default: file exists
    mockFs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('path traversal prevention', () => {
    it('should reject ../ in filename', () => {
      expect(() =>
        controller.serveFile('images', '../../etc/passwd', mockRes),
      ).toThrow(BadRequestException);
    });

    it('should reject ../ in folder', () => {
      expect(() =>
        controller.serveFile('../../etc', 'passwd', mockRes),
      ).toThrow(BadRequestException);
    });

    it('should reject encoded path traversal', () => {
      expect(() =>
        controller.serveFile('images', '..\\..\\windows\\system32\\config\\sam', mockRes),
      ).toThrow(BadRequestException);
    });

    it('should reject absolute path in filename', () => {
      expect(() =>
        controller.serveFile('images', '/etc/passwd', mockRes),
      ).toThrow(BadRequestException);
    });

    it('should reject null bytes in filename', () => {
      expect(() =>
        controller.serveFile('images', 'legit.png\0../../etc/passwd', mockRes),
      ).toThrow(BadRequestException);
    });

    it('should reject empty sanitized filename', () => {
      expect(() =>
        controller.serveFile('images', '../', mockRes),
      ).toThrow(BadRequestException);
    });

    it('should reject empty sanitized folder', () => {
      expect(() =>
        controller.serveFile('../', 'test.png', mockRes),
      ).toThrow(BadRequestException);
    });
  });

  describe('valid file serving', () => {
    it('should serve a valid file from subfolder', () => {
      controller.serveFile('avatars', 'user1.png', mockRes);

      const expectedPath = path.resolve(uploadsRoot, 'avatars', 'user1.png');
      expect(mockRes.sendFile).toHaveBeenCalledWith(expectedPath);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=86400');
    });

    it('should serve jpg with correct mime type', () => {
      controller.serveFile('photos', 'vacation.jpg', mockRes);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    });

    it('should use application/octet-stream for unknown extensions', () => {
      controller.serveFile('docs', 'readme.txt', mockRes);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    });

    it('should throw NotFoundException when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() =>
        controller.serveFile('images', 'missing.png', mockRes),
      ).toThrow(NotFoundException);
    });
  });
});
