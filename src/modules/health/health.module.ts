import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [
    StellarModule,
    BullModule.registerQueue({ name: 'webhooks' }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule { }
