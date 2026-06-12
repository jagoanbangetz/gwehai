import { Module } from '@nestjs/common';
import { PromptManagerService } from './prompt-manager.service';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [ToolsModule],
  providers: [PromptManagerService],
  exports: [PromptManagerService],
})
export class PromptModule {}
