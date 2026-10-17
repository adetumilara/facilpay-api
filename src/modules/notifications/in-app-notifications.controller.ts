import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { InAppNotificationsService } from './in-app-notifications.service';
import { InAppNotification } from './in-app-notification.entity';

@ApiTags('notifications')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('v1/notifications')
export class InAppNotificationsController {
  constructor(
    private readonly notificationsService: InAppNotificationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the authenticated user' })
  @ApiQuery({
    name: 'unread',
    required: false,
    type: Boolean,
    description: 'When true, return only unread notifications',
  })
  @ApiOkResponse({ type: [InAppNotification] })
  @ApiUnauthorizedResponse()
  list(
    @CurrentUser() user: User,
    @Query('unread') unread?: string,
  ): Promise<InAppNotification[]> {
    const unreadOnly = unread === 'true' || unread === '1';
    return this.notificationsService.findForUser(user.id, unreadOnly);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiOkResponse({ schema: { example: { count: 3 } } })
  @ApiUnauthorizedResponse()
  unreadCount(@CurrentUser() user: User): Promise<{ count: number }> {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiOkResponse({ type: InAppNotification })
  @ApiNotFoundResponse({ description: 'Notification not found' })
  @ApiUnauthorizedResponse()
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<InAppNotification> {
    return this.notificationsService.markRead(id, user.id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiOkResponse({ schema: { example: { updated: 5 } } })
  @ApiUnauthorizedResponse()
  markAllRead(@CurrentUser() user: User): Promise<{ updated: number }> {
    return this.notificationsService.markAllRead(user.id);
  }
}
