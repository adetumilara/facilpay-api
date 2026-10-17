import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';
import { UserSecurityService } from './user-security.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResult } from '../../common/interfaces';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRateLimitDto } from './dto/update-rate-limit.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { LoginHistoryQueryDto } from './dto/login-history-query.dto';
import { RequestDataExportDto } from './dto/request-data-export.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from './user.entity';
import { UserRole } from '../../common/constants/roles';
import { LoginHistoryService } from '../auth/login-history.service';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@ApiTags('users')
@Controller('v1/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userSecurityService: UserSecurityService,
    private readonly loginHistoryService: LoginHistoryService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a user',
    description:
      'Creates a new user and returns the user (password is never returned). This endpoint is public.',
  })
  @ApiBody({
    type: CreateUserDto,
    examples: {
      basic: {
        summary: 'Create user with email + password',
        value: { email: 'jane.doe@example.com', password: 'P@ssw0rd!' },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'User created successfully.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.doe@example.com',
        createdAt: '2026-01-26T10:00:00.000Z',
        updatedAt: '2026-01-26T10:00:00.000Z',
      },
    },
  })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      "Updates the authenticated user's profile. Supports updating display name, email, and password. If email is changed, email verification is required. Changing password requires the current password and invalidates all refresh tokens.",
  })
  @ApiBody({
    type: UpdateUserDto,
    examples: {
      updateName: {
        summary: 'Update display name only',
        value: { name: 'Jane Doe' },
      },
      updateEmail: {
        summary: 'Update email only',
        value: { email: 'jane.new@example.com' },
      },
      updateBoth: {
        summary: 'Update both name and email',
        value: { name: 'Jane Doe', email: 'jane.new@example.com' },
      },
      updatePassword: {
        summary: 'Update password (requires current password)',
        value: { password: 'N3wP@ssw0rd!', currentPassword: 'Curr3nt@Pss!' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Profile updated successfully.',
    schema: {
      example: {
        user: {
          id: 'abc123',
          name: 'Jane Doe',
          email: 'jane.new@example.com',
          isEmailVerified: false,
          createdAt: '2026-01-26T10:00:00.000Z',
          updatedAt: '2026-01-26T12:00:00.000Z',
        },
        emailVerificationRequired: true,
      },
    },
  })
  @ApiConflictResponse({
    description: 'Email is already taken by another account.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Email is already taken by another account',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
      },
    },
  })
  async updateMe(
    @CurrentUser() user: User,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user.id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      "Returns the authenticated user's profile. Password and 2FA secret are never included.",
  })
  @ApiOkResponse({
    description: 'Authenticated user profile.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.doe@example.com',
        name: 'Jane Doe',
        roles: ['USER'],
        isEmailVerified: true,
        isActive: true,
        createdAt: '2026-01-26T10:00:00.000Z',
        updatedAt: '2026-01-26T10:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid access token.',
    schema: { example: { statusCode: 401, message: 'Unauthorized' } },
  })
  getMe(@CurrentUser() user: User) {
    return this.usersService.findOne(user.id);
  }

  // ── #429 ─────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } } as any) // 5 per 15 min
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Change password (authenticated)',
    description:
      'Change the current password. Enforces strength policy and reuse history. Revokes all other sessions after a successful change. Rate-limited to 5 attempts per 15 minutes.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({
    description: 'Password changed successfully.',
    schema: { example: { message: 'Password changed successfully. All other sessions have been revoked.' } },
  })
  @ApiUnauthorizedResponse({ description: 'Current password is incorrect.' })
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.userSecurityService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      req.ip,
      req.headers['user-agent'],
    );
  }

  // ── #430 ─────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me/login-history')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Login history',
    description:
      'Returns a paginated list of login events (successes and failures) for the last 90 days. Users see only their own history.',
  })
  @ApiOkResponse({
    description: 'Paginated login events.',
    schema: {
      example: {
        data: [
          {
            id: 'uuid',
            success: true,
            reason: null,
            ipAddress: '1.2.3.4',
            userAgent: 'Mozilla/5.0...',
            country: 'BR',
            createdAt: '2026-09-29T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing/invalid access token.' })
  async getLoginHistory(
    @CurrentUser() user: User,
    @Query() query: LoginHistoryQueryDto,
  ) {
    return this.loginHistoryService.findForUser(user.id, {
      page: query.page,
      limit: query.limit,
      failuresOnly: query.failuresOnly,
    });
  }

  // ── #428 ─────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('me/email')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Initiate email-address change',
    description:
      'Request an email-address change. A confirmation link is sent to the new address; a notice with a revert link is sent to the old address. The swap is applied only after the user clicks the confirmation link.',
  })
  @ApiBody({ type: ChangeEmailDto })
  @ApiOkResponse({
    description: 'Email change initiated.',
    schema: {
      example: {
        message: 'A confirmation link has been sent to your new email address. Your current address has also been notified.',
      },
    },
  })
  @ApiConflictResponse({ description: 'New email address is already in use.' })
  @ApiUnauthorizedResponse({ description: 'Password is incorrect.' })
  async initiateEmailChange(
    @CurrentUser() user: User,
    @Body() dto: ChangeEmailDto,
    @Req() req: Request,
  ) {
    return this.userSecurityService.initiateEmailChange(
      user.id,
      dto.newEmail,
      dto.password,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('me/email/confirm')
  @ApiOperation({
    summary: 'Confirm email-address change',
    description:
      'Validates the signed token sent to the new address and atomically swaps the email. Also revokes other sessions.',
  })
  @ApiOkResponse({
    description: 'Email changed.',
    schema: { example: { message: 'Email address updated successfully. All sessions have been revoked.' } },
  })
  async confirmEmailChange(@Query('token') token: string) {
    return this.userSecurityService.confirmEmailChange(token);
  }

  @Get('me/email/revert')
  @ApiOperation({
    summary: 'Revert a pending email-address change',
    description:
      'Validates the signed revert token sent to the old address and cancels the pending email-change request.',
  })
  @ApiOkResponse({
    description: 'Email change cancelled.',
    schema: { example: { message: 'Email change has been cancelled. Your original address remains active.' } },
  })
  async revertEmailChange(@Query('token') token: string) {
    return this.userSecurityService.revertEmailChange(token);
  }

  // ── #427 ─────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('me/data-export')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 86_400_000 } } as any) // 3 per 24 h (additional throttler layer)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Request personal data export (GDPR)',
    description:
      'Enqueues a personal-data export. Requires step-up authentication (password). Rate-limited to one export per 24 h. A time-limited download link is emailed to the account address.',
  })
  @ApiBody({ type: RequestDataExportDto })
  @ApiOkResponse({
    description: 'Export ready, link emailed.',
    schema: {
      example: {
        message: 'Your data export has been prepared. A download link has been sent to your email address. The link expires in 48 hours.',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Password is incorrect.' })
  async requestDataExport(
    @CurrentUser() user: User,
    @Body() dto: RequestDataExportDto,
    @Req() req: Request,
  ) {
    return this.userSecurityService.requestDataExport(
      user.id,
      dto.password,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('me/data-export/download')
  @ApiOperation({
    summary: 'Download personal data export',
    description:
      'Downloads the redacted personal-data JSON using the signed token emailed after a successful export request. The token expires after 48 hours. Never includes passwords, 2FA secrets, or other credentials.',
  })
  @ApiOkResponse({
    description: 'Redacted personal-data JSON.',
    schema: {
      example: {
        exportedAt: '2026-09-29T10:00:00.000Z',
        profile: { id: 'uuid', email: 'jane@example.com' },
        sessions: [],
      },
    },
  })
  async downloadDataExport(@Query('token') token: string) {
    return this.userSecurityService.downloadDataExport(token);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'List users with pagination and filtering',
    description:
      'Returns paginated users (passwords are never returned). Admin only.',
  })
  @ApiOkResponse({
    description: 'Paginated list of users.',
    schema: {
      example: {
        data: [
          {
            id: 'abc123',
            email: 'jane.doe@example.com',
            roles: ['USER'],
            createdAt: '2026-01-26T10:00:00.000Z',
            updatedAt: '2026-01-26T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'User does not have ADMIN role.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
      },
    },
  })
  findAll(@Query() query: PaginationDto): Promise<PaginatedResult<any>> {
    return this.usersService.findAll(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get a user by id',
    description:
      'Returns a single user by their id. Users can only view their own profile unless they are an admin.',
  })
  @ApiParam({
    name: 'id',
    description: 'User id.',
    example: 'abc123',
  })
  @ApiOkResponse({
    description: 'User found.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.doe@example.com',
        createdAt: '2026-01-26T10:00:00.000Z',
        updatedAt: '2026-01-26T10:00:00.000Z',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Non-admin users can only view their own profile.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
      },
    },
  })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.usersService.findOneWithAuth(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Update a user',
    description:
      'Updates user fields by id. Only provided fields will be changed. Supports updating display name, email, and password. Changing password requires the current password and invalidates all refresh tokens. Users can only update their own profile unless they are an admin.',
  })
  @ApiParam({
    name: 'id',
    description: 'User id.',
    example: 'abc123',
  })
  @ApiBody({
    type: UpdateUserDto,
    examples: {
      updateEmail: {
        summary: 'Update email only',
        value: { email: 'jane.new@example.com' },
      },
      updatePassword: {
        summary: 'Update password (requires current password)',
        value: { password: 'N3wP@ssw0rd!', currentPassword: 'Curr3nt@Pss!' },
      },
    },
  })
  @ApiOkResponse({
    description: 'User updated successfully.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.new@example.com',
        createdAt: '2026-01-26T10:00:00.000Z',
        updatedAt: '2026-01-26T12:00:00.000Z',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Non-admin users can only update their own profile.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Current password is incorrect when changing password.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Current password is incorrect',
      },
    },
  })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: User,
  ) {
    return this.usersService.updateWithAuth(id, updateUserDto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Delete a user',
    description: 'Soft deletes a user by id (sets deletedAt). Admin only.',
  })
  @ApiParam({
    name: 'id',
    description: 'User id.',
    example: 'abc123',
  })
  @ApiNoContentResponse({
    description: 'User deleted successfully.',
  })
  @ApiForbiddenResponse({
    description: 'User does not have ADMIN role.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
        error: 'Forbidden',
      },
    },
  })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.usersService.softDelete(
      id,
      user.id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Delete current user account',
    description: 'Soft deletes the authenticated user account.',
  })
  @ApiNoContentResponse({
    description: 'Account deleted successfully.',
  })
  async deleteSelf(@Req() req: Request) {
    await this.usersService.softDelete(
      req.user.id,
      req.user.id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/restore')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Restore a deleted user',
    description: 'Restores a soft-deleted user account. Admin only.',
  })
  @ApiParam({
    name: 'id',
    description: 'User id.',
    example: 'abc123',
  })
  @ApiOkResponse({
    description: 'User restored successfully.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.doe@example.com',
        roles: ['USER'],
        isEmailVerified: true,
        isActive: true,
        deletedAt: null,
        createdAt: '2026-01-26T10:00:00.000Z',
        updatedAt: '2026-01-26T12:00:00.000Z',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'User does not have ADMIN role.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
        error: 'Forbidden',
      },
    },
  })
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.usersService.restore(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/rate-limit')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Update user rate limit configuration',
    description:
      'Updates the rate limit configuration for a specific user. Admin only.',
  })
  @ApiParam({
    name: 'id',
    description: 'User id.',
    example: 'abc123',
  })
  @ApiBody({
    type: UpdateRateLimitDto,
    examples: {
      enableCustom: {
        summary: 'Enable custom rate limits',
        value: {
          rateLimitEnabled: true,
          rateLimitLimit: 200,
          rateLimitTtl: 60000,
        },
      },
      disableCustom: {
        summary: 'Disable custom rate limits',
        value: {
          rateLimitEnabled: false,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Rate limit configuration updated successfully.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.doe@example.com',
        rateLimitEnabled: true,
        rateLimitLimit: 200,
        rateLimitTtl: 60000,
        updatedAt: '2026-01-26T12:00:00.000Z',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'User does not have ADMIN role.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
      },
    },
  })
  async updateRateLimit(
    @Param('id') id: string,
    @Body() updateRateLimitDto: UpdateRateLimitDto,
  ) {
    return this.usersService.updateRateLimit(
      id,
      updateRateLimitDto.rateLimitEnabled ?? false,
      updateRateLimitDto.rateLimitLimit ?? null,
      updateRateLimitDto.rateLimitTtl ?? null,
    );
  }
}
