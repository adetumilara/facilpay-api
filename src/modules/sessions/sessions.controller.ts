import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiParam,
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { SessionResponseDto } from './dto/session.dto';

@ApiTags('sessions')
@Controller('v1/sessions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List active sessions',
    description:
      "Returns the authenticated user's active (non-revoked, non-expired) sessions.",
  })
  @ApiOkResponse({ description: 'List of active sessions.', type: [SessionResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  findAll(@CurrentUser() user: User) {
    return this.sessionsService.findAllActiveForUser(user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke a session',
    description:
      "Revokes a session and its associated refresh token. Does not affect the user's other sessions.",
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiNoContentResponse({ description: 'Session revoked.' })
  @ApiForbiddenResponse({ description: 'Session belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Session not found.' })
  revoke(@Param('id') id: string, @CurrentUser() user: User) {
    return this.sessionsService.revokeForUser(id, user.id);
  }
}
