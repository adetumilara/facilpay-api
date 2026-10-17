import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Payout } from './entities/payout.entity';
import { MerchantPayoutLimit } from './entities/merchant-payout-limit.entity';
import { Role } from '../auth/entities/role.entity';
import { AuthModule } from '../auth/auth.module';
import { StellarModule } from '../stellar/stellar.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { EventsModule } from '../events/events.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PAYOUTS_QUEUE, PayoutsService } from './payouts.service';
import { PayoutsProcessor } from './payouts.processor';
import { AdminPayoutsController, PayoutsController } from './payouts.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ConfigModule,
    // Role is needed by PermissionsGuard on the create endpoint.
    TypeOrmModule.forFeature([Payout, MerchantPayoutLimit, Role]),
    BullModule.registerQueue({ name: PAYOUTS_QUEUE }),
    AuthModule,
    StellarModule,
    WebhooksModule,
    EventsModule,
    AuditLogsModule,
    UsersModule,
  ],
  controllers: [PayoutsController, AdminPayoutsController],
  providers: [PayoutsService, PayoutsProcessor],
  exports: [PayoutsService],
})
export class PayoutsModule {}
