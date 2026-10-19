import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Logger } from 'pino';
import { AppLogger } from '../../logger/logger.service';
import { EmailLog, EmailLogStatus } from '../email-log.entity';
import {
  EmailSuppression,
  EmailSuppressionReason,
} from '../email-suppression.entity';
import {
  EmailDeliveryEventType,
  EmailEventAdapter,
  EmailWebhookRequest,
  NormalizedEmailEvent,
} from './email-event-adapter.interface';
import { GenericEmailEventAdapter } from './generic-email-event.adapter';
import { SendGridEmailEventAdapter } from './sendgrid-email-event.adapter';
import { PaginatedResult } from '../../../common/interfaces/paginated-result.interface';

export interface EmailEventsResult {
  received: number;
  processed: number;
  suppressed: number;
}

@Injectable()
export class EmailEventsService {
  private readonly logger: Logger;
  private readonly adapters = new Map<string, EmailEventAdapter>();

  constructor(
    @InjectRepository(EmailLog)
    private readonly emailLogRepo: Repository<EmailLog>,
    @InjectRepository(EmailSuppression)
    private readonly suppressionRepo: Repository<EmailSuppression>,
    configService: ConfigService,
    appLogger: AppLogger,
  ) {
    this.logger = appLogger.child({ module: EmailEventsService.name });
    this.registerAdapter(
      new GenericEmailEventAdapter(configService.get<string>('EMAIL_WEBHOOK_SECRET')),
    );
    this.registerAdapter(
      new SendGridEmailEventAdapter(
        configService.get<string>('SENDGRID_WEBHOOK_PUBLIC_KEY'),
      ),
    );
  }

  registerAdapter(adapter: EmailEventAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  async handleWebhook(
    provider: string,
    request: EmailWebhookRequest,
  ): Promise<EmailEventsResult> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new NotFoundException(`Unknown email provider "${provider}"`);
    }
    if (!adapter.verify(request)) {
      this.logger.warn({ provider }, 'Rejected email webhook with invalid signature');
      throw new UnauthorizedException('Invalid email webhook signature');
    }

    const events = adapter.parse(request.body);
    let processed = 0;
    let suppressed = 0;
    for (const event of events) {
      const result = await this.applyEvent(adapter.provider, event);
      if (result.logUpdated) processed += 1;
      if (result.suppressed) suppressed += 1;
    }

    return { received: events.length, processed, suppressed };
  }

  async applyEvent(
    provider: string,
    event: NormalizedEmailEvent,
  ): Promise<{ logUpdated: boolean; suppressed: boolean }> {
    const status = this.statusFor(event.type);
    const log = await this.findLog(event);

    let logUpdated = false;
    if (log && this.shouldUpdate(log.status, status)) {
      log.status = status;
      log.statusUpdatedAt = event.occurredAt;
      if (event.reason) log.errorMessage = event.reason;
      await this.emailLogRepo.save(log);
      logUpdated = true;
    }

    const reason = this.suppressionReasonFor(event);
    const suppressed = reason
      ? await this.suppress(event.email, reason, provider, event.reason ?? null)
      : false;

    return { logUpdated, suppressed };
  }

  async isSuppressed(email: string): Promise<boolean> {
    const count = await this.suppressionRepo.count({
      where: { email: email.trim().toLowerCase() },
    });
    return count > 0;
  }

  /** Returns true when a new suppression row was created. */
  async suppress(
    email: string,
    reason: EmailSuppressionReason,
    provider: string | null,
    details: string | null,
  ): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const result = await this.suppressionRepo
      .createQueryBuilder()
      .insert()
      .into(EmailSuppression)
      .values({ email: normalized, reason, provider, details })
      .orIgnore()
      .execute();

    // ON CONFLICT DO NOTHING returns no rows when the address was already suppressed.
    const created = Array.isArray(result.raw) && result.raw.length > 0;
    if (created) {
      this.logger.info({ email: normalized, reason, provider }, 'Email address suppressed');
    }
    return created;
  }

  async listSuppressions(
    page = 1,
    limit = 20,
    search?: string,
  ): Promise<PaginatedResult<EmailSuppression>> {
    const [data, total] = await this.suppressionRepo.findAndCount({
      where: search ? { email: ILike(`%${search.toLowerCase()}%`) } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async removeSuppression(id: string): Promise<void> {
    const result = await this.suppressionRepo.delete({ id });
    if (!result.affected) {
      throw new NotFoundException('Suppression not found');
    }
  }

  private async findLog(event: NormalizedEmailEvent): Promise<EmailLog | null> {
    if (event.messageId) {
      const byMessageId = await this.emailLogRepo.findOne({
        where: { providerMessageId: event.messageId },
      });
      if (byMessageId) return byMessageId;
    }
    // Fall back to the most recent email sent to this address.
    return this.emailLogRepo.findOne({
      where: { recipientEmail: event.email },
      order: { sentAt: 'DESC' },
    });
  }

  private statusFor(type: EmailDeliveryEventType): EmailLogStatus {
    switch (type) {
      case EmailDeliveryEventType.DELIVERED:
        return EmailLogStatus.DELIVERED;
      case EmailDeliveryEventType.BOUNCED:
        return EmailLogStatus.BOUNCED;
      case EmailDeliveryEventType.COMPLAINED:
        return EmailLogStatus.COMPLAINED;
    }
  }

  /** A late "delivered" must not overwrite a bounce or complaint. */
  private shouldUpdate(current: EmailLogStatus, next: EmailLogStatus): boolean {
    if (next === EmailLogStatus.DELIVERED) {
      return current === EmailLogStatus.SENT || current === EmailLogStatus.FAILED;
    }
    return current !== EmailLogStatus.COMPLAINED;
  }

  private suppressionReasonFor(
    event: NormalizedEmailEvent,
  ): EmailSuppressionReason | null {
    if (event.type === EmailDeliveryEventType.COMPLAINED) {
      return EmailSuppressionReason.COMPLAINT;
    }
    if (event.type === EmailDeliveryEventType.BOUNCED && event.bounceType === 'hard') {
      return EmailSuppressionReason.HARD_BOUNCE;
    }
    return null;
  }
}
