import { Module } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';
import { UploadsController } from './uploads.controller';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSetting } from '../entities/admin-setting.entity';

/**
 * StorageModule — S3-compatible object storage (Vultr, AWS, DO).
 * Standalone module, injects AdminSettingsService for config.
 * Also registers UploadsController for local dev file serving.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AdminSetting])],
  controllers: [UploadsController],
  providers: [ObjectStorageService, AdminSettingsService],
  exports: [ObjectStorageService],
})
export class StorageModule {}
