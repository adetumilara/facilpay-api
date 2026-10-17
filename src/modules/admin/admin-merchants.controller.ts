import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/roles';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { MailService } from '../auth/mail/mail.service';
import { SuspendMerchantDto } from './dto/suspend-merchant.dto';

@ApiTags('admin')
@ApiBearerAuth('bearer')
@Controller('v1/admin/merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMerchantsController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
    private readonly mailService: MailService,
  ) {}

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend a merchant' })
  @ApiHeader({ name: 'X-Step-Up-Token', required: true, description: 'Token from POST /v1/auth/step-up' })
  @ApiOkResponse({ description: 'Merchant suspended.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT or step-up token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Merchant not found.' })
  async suspend(
    @Param('id', ParseUUIDPipe) merchantId: string,
    @Body() dto: SuspendMerchantDto,
    @CurrentUser() admin: User,
    @Headers('x-step-up-token') stepUpToken: string,
    @Req() request: Request,
  ) {
    this.authService.validateStepUpToken(stepUpToken, admin.id);
      const merchant = await this.usersService.setMerchantStatus(
        merchantId,
        'SUSPENDED',
        dto.reason?.trim() || null,
      );
      await this.auditLogsService.record({
        actorId: admin.id,
        actorType: 'user',
        action: 'merchant.suspended',
        resourceType: 'merchant',
        resourceId: merchantId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        metadata: { reason: merchant.suspendedReason },
      });
      await this.notifyMerchant(merchant.email, 'SUSPENDED', merchant.suspendedReason);
      return {
        id: merchant.id,
        email: merchant.email,
        status: merchant.status,
        suspendedReason: merchant.suspendedReason,
        suspendedAt: merchant.suspendedAt,
      };
  }

  @Post(':id/reinstate')
  @ApiOperation({ summary: 'Reinstate a suspended merchant' })
  @ApiHeader({ name: 'X-Step-Up-Token', required: true, description: 'Token from POST /v1/auth/step-up' })
  @ApiOkResponse({ description: 'Merchant reinstated.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT or step-up token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Merchant not found.' })
  async reinstate(
    @Param('id', ParseUUIDPipe) merchantId: string,
    @CurrentUser() admin: User,
    @Headers('x-step-up-token') stepUpToken: string,
    @Req() request: Request,
  ) {
    this.authService.validateStepUpToken(stepUpToken, admin.id);
      const merchant = await this.usersService.setMerchantStatus(
        merchantId,
        'ACTIVE',
        null,
      );
      await this.auditLogsService.record({
        actorId: admin.id,
        actorType: 'user',
        action: 'merchant.reinstated',
        resourceType: 'merchant',
        resourceId: merchantId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
      await this.notifyMerchant(merchant.email, 'ACTIVE');
      return {
        id: merchant.id,
        email: merchant.email,
        status: merchant.status,
        suspendedReason: merchant.suspendedReason,
        suspendedAt: merchant.suspendedAt,
      };
  }

  private async notifyMerchant(
    email: string,
    status: 'SUSPENDED' | 'ACTIVE',
    reason?: string | null,
  ): Promise<void> {
    try {
      await this.mailService.sendMerchantStatusEmail(email, status, reason);
    } catch {
      // Email failure must not undo the administrative status change.
    }
  }
}
