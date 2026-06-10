import { Controller, Get } from '@nestjs/common';
import { HealthService, HealthResponse } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
