import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Dispute } from '../payments/dispute.entity';
import { Payment } from '../payments/payment.entity';
import { Refund } from '../payments/refund.entity';
import { MerchantOnboarding } from '../onboarding/merchant-onboarding.entity';
import { Session } from '../auth/entities/session.entity';
import { User } from '../users/user.entity';
import { AdminMerchantsController } from './admin-merchants.controller';
import { AdminMerchantsService } from './admin-merchants.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      MerchantOnboarding,
      Payment,
      Refund,
      Dispute,
      Session,
    ]),
    AuditLogsModule,
  ],
  controllers: [AdminMerchantsController],
  providers: [AdminMerchantsService],
})
export class AdminModule {}
