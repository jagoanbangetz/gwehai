import { Module } from '@nestjs/common';
import { ResearchBrowserService } from './research-browser.service';

@Module({
  providers: [ResearchBrowserService],
  exports: [ResearchBrowserService],
})
export class ResearchBrowserModule {}
