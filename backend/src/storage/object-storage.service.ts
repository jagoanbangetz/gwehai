import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AdminSettingsService } from '../admin/admin-settings.service';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * ObjectStorageService — S3-compatible file upload (Vultr, AWS, DO Spaces).
 * Reads config from admin_settings DB. Falls back to local /tmp if no S3 config.
 */
@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);

  constructor(private readonly settingsService: AdminSettingsService) {}

  /**
   * Upload a file buffer to S3-compatible storage.
   * Returns the public URL of the uploaded file.
   */
  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder: string = 'uploads',
  ): Promise<{ url: string; key: string }> {
    const config = await this.getS3Config();

    // Generate unique filename
    const ext = path.extname(originalName).toLowerCase() || '.bin';
    const hash = crypto.randomBytes(8).toString('hex');
    const key = `${folder}/${Date.now()}-${hash}${ext}`;

    if (config) {
      return this.uploadToS3(config, buffer, key, mimeType);
    }

    // Fallback: local storage
    return this.uploadLocal(buffer, key);
  }

  /**
   * Delete a file from S3-compatible storage by key.
   */
  async delete(key: string): Promise<void> {
    const config = await this.getS3Config();
    if (!config) {
      this.logger.warn('No S3 config — cannot delete from cloud storage');
      return;
    }

    const client = this.createS3Client(config);
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
    this.logger.log(`Deleted from S3: ${key}`);
  }

  // --- Private helpers ---

  private async getS3Config(): Promise<{
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    publicUrl: string;
    forcePathStyle: boolean;
  } | null> {
    try {
      const [endpoint, region, bucket, accessKey, secretKey, publicUrl, pathStyle] =
        await Promise.all([
          this.settingsService.getSetting('STORAGE_ENDPOINT'),
          this.settingsService.getSetting('STORAGE_REGION'),
          this.settingsService.getSetting('STORAGE_BUCKET'),
          this.settingsService.getSetting('STORAGE_ACCESS_KEY'),
          this.settingsService.getSetting('STORAGE_SECRET_KEY'),
          this.settingsService.getSetting('STORAGE_PUBLIC_URL'),
          this.settingsService.getSetting('STORAGE_FORCE_PATH_STYLE'),
        ]);

      if (!endpoint || !bucket || !accessKey || !secretKey) {
        this.logger.debug('S3 config incomplete — using local storage fallback');
        return null;
      }

      return {
        endpoint,
        region: region || 'us-east-1',
        bucket,
        accessKey,
        secretKey,
        publicUrl: publicUrl || endpoint,
        forcePathStyle: pathStyle !== 'false',
      };
    } catch (err) {
      this.logger.warn(`Failed to read S3 config: ${(err as Error).message}`);
      return null;
    }
  }

  private createS3Client(config: {
    endpoint: string;
    region: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
  }): S3Client {
    return new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
  }

  private async uploadToS3(
    config: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      publicUrl: string;
      forcePathStyle: boolean;
    },
    buffer: Buffer,
    key: string,
    mimeType: string,
  ): Promise<{ url: string; key: string }> {
    const client = this.createS3Client(config);

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'public-read',
      }),
    );

    // Build public URL
    const baseUrl = config.publicUrl.replace(/\/$/, '');
    const url = `${baseUrl}/${config.bucket}/${key}`;

    this.logger.log(`Uploaded to S3: ${key} → ${url}`);
    return { url, key };
  }

  private async uploadLocal(
    buffer: Buffer,
    key: string,
  ): Promise<{ url: string; key: string }> {
    const fs = await import('fs/promises');
    const uploadDir = path.join(process.cwd(), 'uploads');

    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, path.basename(key));
    await fs.writeFile(filePath, buffer);

    const filename = path.basename(key);
    const port = process.env.PORT || 3001;
    const baseUrl = process.env.API_BASE_URL || `http://localhost:${port}`;
    const url = `${baseUrl}/uploads/${filename}`;

    this.logger.log(`Saved locally: ${key} → ${url}`);
    return { url, key };
  }
}
