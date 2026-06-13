import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttackChainService } from './attack-chain.service';

@Module({
  imports: [ConfigModule],
  providers: [AttackChainService],
  exports: [AttackChainService],
})
export class AttackChainModule {}
