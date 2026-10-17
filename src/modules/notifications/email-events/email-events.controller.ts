import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { EmailEventsService, EmailEventsResult } from './email-events.service';

@ApiTags('email')
@Controller('v1/email/events')
export class EmailEventsController {
  constructor(private readonly emailEventsService: EmailEventsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive email delivery events (generic adapter)',
    description:
      'Accepts delivered/bounced/complained events signed with X-Email-Webhook-Signature (HMAC-SHA256 of `${timestamp}.${rawBody}` using EMAIL_WEBHOOK_SECRET) and X-Email-Webhook-Timestamp.',
  })
  @ApiOkResponse({ description: 'Events processed.' })
  @ApiUnauthorizedResponse({ description: 'Invalid signature.' })
  receiveGeneric(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
  ): Promise<EmailEventsResult> {
    return this.handle('generic', req, body);
  }

  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive email delivery events from a specific provider',
    description:
      'Provider-specific webhook receiver. Currently supported: `sendgrid` (Event Webhook with signed payloads) and `generic`.',
  })
  @ApiParam({ name: 'provider', example: 'sendgrid' })
  @ApiOkResponse({ description: 'Events processed.' })
  @ApiUnauthorizedResponse({ description: 'Invalid signature.' })
  receive(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
  ): Promise<EmailEventsResult> {
    return this.handle(provider.toLowerCase(), req, body);
  }

  private handle(
    provider: string,
    req: RawBodyRequest<Request>,
    body: unknown,
  ): Promise<EmailEventsResult> {
    return this.emailEventsService.handleWebhook(provider, {
      headers: req.headers,
      rawBody: req.rawBody ?? JSON.stringify(body ?? {}),
      body,
    });
  }
}
