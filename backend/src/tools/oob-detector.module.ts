import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OobLog } from '../entities/oob-log.entity';
import { OobDetectorService } from './oob-detector.service';

@Module({
  imports: [TypeOrmModule.forFeature([OobLog])],
  providers: [OobDetectorService],
  exports: [OobDetectorService],
})
export class OobDetectorModule {}
