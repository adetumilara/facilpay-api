import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service';
import { AuditLog } from './audit-log.entity';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../common/constants/roles';

@ApiTags('audit-logs')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('v1/admin/audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @ApiOperation({
    summary: 'List audit logs',
    description: 'Returns paginated audit logs with optional filtering. Admin only.',
  })
  @ApiOkResponse({
    description: 'Paginated list of audit logs.',
    schema: {
      example: {
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            actorId: 'user-123',
            actorType: 'user',
            action: 'auth.login.success',
            resourceType: 'user',
            resourceId: 'user-123',
            ipAddress: '203.0.113.5',
            userAgent: 'curl/8.0',
            timestamp: '2026-07-26T10:15:00.000Z',
            metadata: { email: 'jane.doe@example.com' },
          },
        ],
        total: 1,
        page: 1,
        limit: 25,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
  @ApiForbiddenResponse({ description: 'User does not have ADMIN role.' })
  @ApiBadRequestResponse({ description: 'Invalid filter parameters.' })
  async findAll(@Query() dto: GetAuditLogsDto): Promise<PaginatedResult<AuditLog>> {
    return this.auditLogsService.findAll({
      actorId: dto.actorId,
      actorType: dto.actorType,
      action: dto.action,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      ipAddress: dto.ipAddress,
      from: dto.from,
      to: dto.to,
      page: dto.page,
      limit: dto.limit,
      order: dto.order,
    });
  }
}
