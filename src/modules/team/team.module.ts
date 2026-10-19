import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantMember } from './entities/merchant-member.entity';
import { MerchantInvitation } from './entities/merchant-invitation.entity';
import { TeamService } from './team.service';
import { TeamController } from './team.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantMember, MerchantInvitation]),
    AuditLogsModule,
  ],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
