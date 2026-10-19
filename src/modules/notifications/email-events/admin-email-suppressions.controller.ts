import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/roles';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { EmailEventsService } from './email-events.service';

@ApiTags('admin')
@Controller('v1/admin/email/suppressions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('bearer')
export class AdminEmailSuppressionsController {
  constructor(private readonly emailEventsService: EmailEventsService) {}

  @Get()
  @ApiOperation({
    summary: 'List suppressed email addresses (admin)',
    description: 'Addresses that hard-bounced, complained or were suppressed manually. `search` filters by email.',
  })
  @ApiOkResponse({ description: 'Paginated suppressions.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  list(@Query() query: PaginationDto) {
    return this.emailEventsService.listSuppressions(
      query.page,
      query.limit,
      query.search,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove an email suppression (admin)',
    description: 'Allows emails to be sent to the address again.',
  })
  @ApiNoContentResponse({ description: 'Suppression removed.' })
  @ApiNotFoundResponse({ description: 'Suppression not found.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.emailEventsService.removeSuppression(id);
  }
}
