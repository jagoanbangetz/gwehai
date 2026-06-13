import { Controller, Get, Param, Res, NotFoundException, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Sanitize a filename by rejecting path traversal attempts and cleaning the input.
 * Rejects: ../, ..\, null bytes, absolute paths. Strips leading slashes.
 */
function sanitizeFilename(raw: string): string {
  // Reject path traversal patterns outright
  if (/\.\.[\/\\]/.test(raw) || /\.\.$/.test(raw)) {
    throw new BadRequestException('Path traversal rejected');
  }
  // Reject null bytes
  if (/\0/.test(raw)) {
    throw new BadRequestException('Invalid filename');
  }
  // Strip leading slashes and drive letters (Windows)
  let clean = raw.replace(/^[/\\]+/, '').replace(/^[a-zA-Z]:[/\\]/, '');
  // Strip ./ at start
  clean = clean.replace(/^\.[/\\]/, '');
  // Collapse multiple slashes
  clean = clean.replace(/[/\\]+/g, path.sep);
  return clean;
}

/**
 * UploadsController — serves locally uploaded files in dev mode.
 * In production, files are served from S3/Vultr CDN directly.
 */
@Controller('uploads')
export class UploadsController {
  private readonly uploadsRoot = path.resolve(process.cwd(), 'uploads');

  @Get(':folder/:filename')
  serveFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    // Sanitize both params
    const safeFolder = sanitizeFilename(folder);
    const safeFilename = sanitizeFilename(filename);

    if (!safeFolder || !safeFilename) {
      throw new BadRequestException('Invalid path');
    }

    // Resolve full path and verify it stays within uploads root
    const filePath = path.resolve(this.uploadsRoot, safeFolder, safeFilename);
    if (!filePath.startsWith(this.uploadsRoot + path.sep) && filePath !== this.uploadsRoot) {
      throw new BadRequestException('Path traversal rejected');
    }

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    // Basic mime detection
    const ext = path.extname(safeFilename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.ico': 'image/x-icon',
      '.svg': 'image/svg+xml',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath);
  }
}
