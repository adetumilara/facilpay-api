import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Dispute, DisputeStatus, DisputeReason } from './dispute.entity';
import { Payment, PaymentStatus } from './payment.entity';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { UpdateDisputeDto } from './dto/update-dispute.dto';
import { AppLogger } from '../logger/logger.service';
import { Logger } from 'pino';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class DisputesService {
  private readonly logger: Logger;

  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly dataSource: DataSource,
    appLogger: AppLogger,
    private readonly emailNotificationService: EmailNotificationService,
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
  ) {
    this.logger = appLogger.child({ module: DisputesService.name });
  }

  async create(paymentId: string, createDisputeDto: CreateDisputeDto, openedBy?: string): Promise<Dispute> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      this.logger.debug(
        `Starting dispute creation transaction for payment: ${paymentId}`,
      );

      const payment = await queryRunner.manager.findOneBy(Payment, { id: paymentId });

      if (!payment) {
        throw new NotFoundException(`Payment with ID ${paymentId} not found`);
      }

      // Check if payment is in a valid state for dispute
      const validStatuses = [PaymentStatus.COMPLETED, PaymentStatus.PARTIALLY_REFUNDED];
      if (!validStatuses.includes(payment.status)) {
        throw new ConflictException(
          `Cannot open dispute for payment with status ${payment.status}. Only completed or partially refunded payments can be disputed.`,
        );
      }

      // Check if a dispute already exists for this payment
      const existingDispute = await queryRunner.manager.findOneBy(Dispute, {
        paymentId,
      });

      if (existingDispute) {
        const terminalStatuses = [DisputeStatus.RESOLVED, DisputeStatus.CLOSED];
        if (!terminalStatuses.includes(existingDispute.status)) {
          throw new ConflictException(
            `An active dispute already exists for payment ${paymentId}`,
          );
        }
      }

      const disputedAmount = createDisputeDto.description
        ? Number(payment.amount) - Number(payment.refundedAmount || 0)
        : null;
      const createdAt = new Date();
      const responseDays = Math.max(
        1,
        Number(this.configService.get('DISPUTE_RESPONSE_DAYS', 7)) || 7,
      );

      const dispute = queryRunner.manager.create(Dispute, {
        paymentId,
        status: DisputeStatus.OPEN,
        reason: createDisputeDto.reason,
        description: createDisputeDto.description,
        disputedAmount,
        openedBy: openedBy || createDisputeDto.openedBy,
        merchantEmail: payment.merchantEmail,
        payerEmail: payment.payerEmail,
        createdAt,
        respondBy: new Date(createdAt.getTime() + responseDays * 24 * 60 * 60 * 1000),
      });

      const savedDispute = await queryRunner.manager.save(dispute);

      await queryRunner.commitTransaction();
      this.logger.info(
        `Dispute created successfully: ${savedDispute.id} for payment ${paymentId}`,
      );

      // Send notifications
      await this.sendDisputeNotifications(savedDispute, payment);

      // Dispatch webhook
      await this.dispatchDisputeWebhook(savedDispute, 'dispute.opened');

      return savedDispute;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Dispute creation failed and rolled back: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(status?: DisputeStatus, paymentId?: string): Promise<Dispute[]> {
    const query = this.disputeRepository.createQueryBuilder('dispute');

    if (status) {
      query.andWhere('dispute.status = :status', { status });
    }

    if (paymentId) {
      query.andWhere('dispute.paymentId = :paymentId', { paymentId });
    }

    query.orderBy('dispute.createdAt', 'DESC');

    return await query.getMany();
  }

  async findOne(id: string): Promise<Dispute> {
    const dispute = await this.disputeRepository.findOneBy({ id });
    if (!dispute) {
      throw new NotFoundException(`Dispute with ID ${id} not found`);
    }
    return dispute;
  }

  async update(id: string, updateDisputeDto: UpdateDisputeDto, resolvedBy?: string): Promise<Dispute> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      this.logger.debug(`Starting dispute update transaction for dispute: ${id}`);

      const dispute = await queryRunner.manager.findOneBy(Dispute, { id });

      if (!dispute) {
        throw new NotFoundException(`Dispute with ID ${id} not found`);
      }

      const previousStatus = dispute.status;

      // Validate status transitions
      if (updateDisputeDto.status) {
        this.validateStatusTransition(dispute.status, updateDisputeDto.status);
        
        dispute.status = updateDisputeDto.status;

        // Set timestamps based on status
        if (updateDisputeDto.status === DisputeStatus.RESOLVED) {
          dispute.resolvedAt = new Date();
          dispute.resolvedBy = resolvedBy || updateDisputeDto.resolvedBy;
        } else if (updateDisputeDto.status === DisputeStatus.CLOSED) {
          dispute.closedAt = new Date();
        } else if (updateDisputeDto.status === DisputeStatus.ESCALATED) {
          dispute.escalatedAt = new Date();
        }
      }

      if (updateDisputeDto.resolutionNotes !== undefined) {
        dispute.resolutionNotes = updateDisputeDto.resolutionNotes;
      }

      if (updateDisputeDto.resolvedBy && dispute.status === DisputeStatus.RESOLVED) {
        dispute.resolvedBy = updateDisputeDto.resolvedBy;
      }

      const updatedDispute = await queryRunner.manager.save(dispute);

      await queryRunner.commitTransaction();
      this.logger.info(
        `Dispute updated successfully: ${updatedDispute.id}, status: ${previousStatus} -> ${updatedDispute.status}`,
      );

      // Send notifications if status changed
      if (updateDisputeDto.status && previousStatus !== updateDisputeDto.status) {
        await this.sendDisputeStatusNotification(updatedDispute, previousStatus);
        await this.dispatchDisputeWebhook(updatedDispute, 'dispute.updated');
        if (updatedDispute.status === DisputeStatus.RESOLVED) {
          await this.dispatchDisputeWebhook(updatedDispute, 'dispute.resolved');
        } else if (updatedDispute.status === DisputeStatus.CLOSED) {
          await this.dispatchDisputeWebhook(updatedDispute, 'dispute.closed');
        }
      }

      return updatedDispute;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Dispute update failed and rolled back: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private validateStatusTransition(currentStatus: DisputeStatus, newStatus: DisputeStatus): void {
    const validTransitions: Record<DisputeStatus, DisputeStatus[]> = {
      [DisputeStatus.OPEN]: [DisputeStatus.UNDER_REVIEW, DisputeStatus.CLOSED, DisputeStatus.ESCALATED],
      [DisputeStatus.UNDER_REVIEW]: [DisputeStatus.RESOLVED, DisputeStatus.CLOSED, DisputeStatus.ESCALATED],
      [DisputeStatus.ESCALATED]: [DisputeStatus.UNDER_REVIEW, DisputeStatus.RESOLVED, DisputeStatus.CLOSED],
      [DisputeStatus.RESOLVED]: [DisputeStatus.CLOSED],
      [DisputeStatus.CLOSED]: [],
    };

    const allowedTransitions = validTransitions[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new ConflictException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processResponseDeadlines(): Promise<void> {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const activeStatuses = [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW];
    const disputes = await this.disputeRepository.find({
      where: {
        status: In(activeStatuses),
        respondBy: LessThanOrEqual(threeDaysFromNow),
      },
    });

    for (const dispute of disputes) {
      const timeRemaining = dispute.respondBy.getTime() - now.getTime();
      if (timeRemaining <= 0) {
        await this.escalateIfOverdue(dispute, now);
        continue;
      }
      if (!dispute.merchantEmail) continue;

      const daysRemaining = timeRemaining <= 24 * 60 * 60 * 1000 ? 1 : 3;
      const reminderField = daysRemaining === 1
        ? 'reminder1DaySentAt'
        : 'reminder3DaySentAt';
      if (!(await this.markReminderSent(dispute.id, reminderField, now))) continue;
      await this.emailNotificationService.sendDisputeResponseReminder(
        dispute.merchantEmail,
        { disputeId: dispute.id, paymentId: dispute.paymentId, respondBy: dispute.respondBy, daysRemaining },
      ).catch((error) => this.logger.error(
        { error: error.message, disputeId: dispute.id },
        'Failed to send dispute response deadline reminder',
      ));
    }
  }

  private async markReminderSent(
    disputeId: string,
    field: 'reminder3DaySentAt' | 'reminder1DaySentAt',
    sentAt: Date,
  ): Promise<boolean> {
    const result = await this.disputeRepository
      .createQueryBuilder()
      .update(Dispute)
      .set({ [field]: sentAt })
      .where('id = :disputeId', { disputeId })
      .andWhere(`"${field}" IS NULL`)
      .andWhere('status IN (:...statuses)', {
        statuses: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW],
      })
      .execute();
    return result.affected === 1;
  }

  private async escalateIfOverdue(dispute: Dispute, now: Date): Promise<void> {
    const result = await this.disputeRepository
      .createQueryBuilder()
      .update(Dispute)
      .set({ status: DisputeStatus.ESCALATED, escalatedAt: now })
      .where('id = :disputeId', { disputeId: dispute.id })
      .andWhere('status IN (:...statuses)', {
        statuses: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW],
      })
      .andWhere('"respondBy" <= :now', { now })
      .execute();
    if (result.affected !== 1) return;

    const previousStatus = dispute.status;
    dispute.status = DisputeStatus.ESCALATED;
    dispute.escalatedAt = now;
    await this.sendDisputeStatusNotification(dispute, previousStatus);
    await this.dispatchDisputeWebhook(dispute, 'dispute.updated');

    const adminEmails = (this.configService.get<string>(
      'DISPUTE_ADMIN_EMAILS',
      this.configService.get<string>('ADMIN_EMAIL', ''),
    ) ?? '').split(',').map((email) => email.trim()).filter(Boolean);
    for (const email of adminEmails) {
      await this.emailNotificationService.sendDisputeEscalatedNotice(email, {
        disputeId: dispute.id,
        paymentId: dispute.paymentId,
        respondBy: dispute.respondBy,
      }).catch((error) => this.logger.error(
        { error: error.message, disputeId: dispute.id, email },
        'Failed to send dispute escalation notification',
      ));
    }
  }

  private async sendDisputeNotifications(dispute: Dispute, payment: Payment): Promise<void> {
    // Send notification to merchant
    if (dispute.merchantEmail) {
      await this.emailNotificationService.sendMerchantDisputeOpened(
        dispute.merchantEmail,
        null,
        payment.id,
        dispute.id,
        String(payment.amount),
        payment.currency,
        dispute.description,
      ).catch((error) => {
        this.logger.error(
          { error: error.message, disputeId: dispute.id },
          'Failed to send merchant dispute notification',
        );
      });
    }

    // Send notification to payer
    if (dispute.payerEmail) {
      await this.emailNotificationService.sendPayerDisputeOpened(
        dispute.payerEmail,
        null,
        payment.id,
        dispute.id,
        String(payment.amount),
        payment.currency,
        dispute.description,
        payment.payerLocale,
      ).catch((error) => {
        this.logger.error(
          { error: error.message, disputeId: dispute.id },
          'Failed to send payer dispute notification',
        );
      });
    }
  }

  private async sendDisputeStatusNotification(dispute: Dispute, previousStatus: DisputeStatus): Promise<void> {
    // Get payment details
    const payment = await this.paymentRepository.findOneBy({ id: dispute.paymentId });
    if (!payment) return;

    // Notify merchant of status change
    if (dispute.merchantEmail) {
      await this.emailNotificationService.sendMerchantDisputeStatusChanged(
        dispute.merchantEmail,
        null,
        payment.id,
        dispute.id,
        String(payment.amount),
        payment.currency,
        previousStatus,
        dispute.status,
        dispute.resolutionNotes,
      ).catch((error) => {
        this.logger.error(
          { error: error.message, disputeId: dispute.id },
          'Failed to send merchant dispute status notification',
        );
      });
    }

    // Notify payer of status change
    if (dispute.payerEmail) {
      await this.emailNotificationService.sendPayerDisputeStatusChanged(
        dispute.payerEmail,
        null,
        payment.id,
        dispute.id,
        String(payment.amount),
        payment.currency,
        previousStatus,
        dispute.status,
        dispute.resolutionNotes,
        payment.payerLocale,
      ).catch((error) => {
        this.logger.error(
          { error: error.message, disputeId: dispute.id },
          'Failed to send payer dispute status notification',
        );
      });
    }
  }

  private async dispatchDisputeWebhook(dispute: Dispute, event: string): Promise<void> {
    const payment = await this.paymentRepository.findOneBy({ id: dispute.paymentId });
    if (!payment || !payment.merchantId) {
      this.logger.error(
        `Failed to dispatch dispute webhook: payment or merchantId not found for dispute ${dispute.id}`,
      );
      return;
    }

    await this.webhooksService.dispatchEventToMerchant(
      payment.merchantId,
      event,
      {
        disputeId: dispute.id,
        paymentId: dispute.paymentId,
        status: dispute.status,
        reason: dispute.reason,
        disputedAmount: dispute.disputedAmount,
        timestamp: new Date().toISOString(),
      },
    ).catch((error) => {
      this.logger.error(
        { error: error.message, disputeId: dispute.id, event },
        'Failed to dispatch dispute webhook',
      );
    });
  }
}