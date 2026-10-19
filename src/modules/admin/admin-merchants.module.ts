import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AdminMerchantsController } from './admin-merchants.controller';

@Module({
  imports: [AuthModule, UsersModule, AuditLogsModule],
  controllers: [AdminMerchantsController],
})
export class AdminMerchantsModule {}
