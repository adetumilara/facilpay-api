import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { AppLogger } from '../logger/logger.service';
import { Logger } from 'pino';
import { EmailLog, EmailEventType, EmailLogStatus } from './email-log.entity';
import { EmailSuppression } from './email-suppression.entity';
import { normalizeLocale } from './i18n/locale';
import { resolveTemplatePath } from './i18n/template-resolver';

@Injectable()
export class EmailService {
  private readonly logger: Logger;
  private readonly appUrl: string;

  constructor(
    private readonly mailerService: MailerService,
    private configService: ConfigService,
    @InjectRepository(EmailLog)
    private readonly emailLogRepo: Repository<EmailLog>,
    @InjectRepository(EmailSuppression)
    private readonly suppressionRepo: Repository<EmailSuppression>,
    appLogger: AppLogger,
  ) {
    this.logger = appLogger.child({ module: EmailService.name });
    this.appUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
  }

  private getUnsubscribeUrl(recipientEmail: string): string {
    const encoded = Buffer.from(recipientEmail).toString('base64');
    return `${this.appUrl}/unsubscribe?email=${encoded}`;
  }

  async sendEmail(options: {
    to: string;
    subject: string;
    templateName: string;
    templateData: Record<string, any>;
    eventType: EmailEventType;
    recipientRole: string;
    paymentId?: string;
    refundId?: string;
    includeUnsubscribe?: boolean;
    locale?: string | null;
  }): Promise<void> {
    const locale = normalizeLocale(options.locale);
    const context: Record<string, any> = {
      ...options.templateData,
      locale,
      appUrl: this.appUrl,
      year: new Date().getFullYear(),
    };

    const suppressed = await this.suppressionRepo.count({
      where: { email: options.to.trim().toLowerCase() },
    });
    if (suppressed > 0) {
      await this.emailLogRepo.save({
        eventType: options.eventType,
        recipientEmail: options.to,
        recipientRole: options.recipientRole,
        subject: options.subject,
        status: EmailLogStatus.SUPPRESSED,
        errorMessage: 'Recipient address is suppressed',
        paymentId: options.paymentId || null,
        refundId: options.refundId || null,
      });
      this.logger.info(
        { eventType: options.eventType, to: options.to },
        'Skipped email to suppressed address',
      );
      return;
    }

    if (options.includeUnsubscribe) {
      context.unsubscribeUrl = this.getUnsubscribeUrl(options.to);
    }

    try {
      const info = await this.mailerService.sendMail({
        to: options.to,
        subject: options.subject,
        template: resolveTemplatePath(options.templateName, locale),
        context,
      });

      await this.emailLogRepo.save({
        eventType: options.eventType,
        recipientEmail: options.to,
        recipientRole: options.recipientRole,
        subject: options.subject,
        status: EmailLogStatus.SENT,
        paymentId: options.paymentId || null,
        refundId: options.refundId || null,
        providerMessageId:
          typeof info?.messageId === 'string' ? info.messageId : null,
      });

      this.logger.info(
        { eventType: options.eventType, to: options.to },
        'Email sent successfully',
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await this.emailLogRepo.save({
        eventType: options.eventType,
        recipientEmail: options.to,
        recipientRole: options.recipientRole,
        subject: options.subject,
        status: EmailLogStatus.FAILED,
        errorMessage: errorMsg,
        paymentId: options.paymentId || null,
        refundId: options.refundId || null,
      });

      this.logger.error(
        { eventType: options.eventType, to: options.to, error: errorMsg },
        'Email sending failed',
      );

      throw error;
    }
  }
}
