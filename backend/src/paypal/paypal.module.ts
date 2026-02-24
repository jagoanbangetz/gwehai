import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaypalService } from './paypal.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 0,
    }),
  ],
  providers: [PaypalService],
  exports: [PaypalService],
})
export class PaypalModule {}
