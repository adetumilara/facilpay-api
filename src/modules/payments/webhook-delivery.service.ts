import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { WebhookDelivery, WebhookDeliveryStatus } from './webhook-delivery.entity';
import { Payment } from './payment.entity';
import { AppLogger } from '../logger/logger.service';
import { Logger } from 'pino';

export const MAX_ATTEMPTS = 5;
export const BACKOFF_DELAYS_MS = [
  60_000,        // after attempt 1 → retry in 1 min
  300_000,       // after attempt 2 → retry in 5 min
  1_800_000,     // after attempt 3 → retry in 30 min
  7_200_000,     // after attempt 4 → retry in 2 h
];

@Injectable()
export class WebhookDeliveryService {
  private readonly logger: Logger;

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    private readonly httpService: HttpService,
    appLogger: AppLogger,
  ) {
    this.logger = appLogger.child({ module: WebhookDeliveryService.name });
  }

  async enqueue(payment: Payment): Promise<void> {
    if (!payment.callbackUrl) return;

    const delivery = this.deliveryRepo.create({
      paymentId: payment.id,
      callbackUrl: payment.callbackUrl,
      payload: {
        paymentId: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        externalReference: payment.externalReference,
        updatedAt: payment.updatedAt,
      },
      status: WebhookDeliveryStatus.PENDING,
      attemptCount: 0,
      nextRetryAt: new Date(),
    });

    await this.deliveryRepo.save(delivery);
    this.logger.info(
      { paymentId: payment.id, deliveryId: delivery.id, event: 'webhook_delivery_enqueued' },
      'Webhook delivery enqueued',
    );
  }

  async attempt(delivery: WebhookDelivery): Promise<void> {
    const now = new Date();
    delivery.lastAttemptAt = now;
    delivery.attemptCount += 1;

    try {
      const response = await firstValueFrom(
        this.httpService.post(delivery.callbackUrl, delivery.payload, {
          timeout: 10_000,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      delivery.status = WebhookDeliveryStatus.DELIVERED;
      delivery.lastStatusCode = response.status;
      delivery.nextRetryAt = null;

      this.logger.info(
        {
          deliveryId: delivery.id,
          paymentId: delivery.paymentId,
          attempt: delivery.attemptCount,
          statusCode: response.status,
          event: 'webhook_delivery_succeeded',
        },
        'Webhook delivered successfully',
      );
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number }; message?: string };
      const statusCode = axiosError?.response?.status ?? null;
      const errorMsg = axiosError instanceof Error ? axiosError.message : String(axiosError);

      delivery.lastStatusCode = statusCode ?? null;
      delivery.lastError = errorMsg.slice(0, 500);

      if (delivery.attemptCount >= MAX_ATTEMPTS) {
        delivery.status = WebhookDeliveryStatus.DEAD;
        delivery.nextRetryAt = null;

        this.logger.warn(
          {
            deliveryId: delivery.id,
            paymentId: delivery.paymentId,
            attempt: delivery.attemptCount,
            event: 'webhook_delivery_dead',
          },
          'Webhook delivery permanently failed',
        );
      } else {
        delivery.status = WebhookDeliveryStatus.FAILED;
        const delayMs = BACKOFF_DELAYS_MS[delivery.attemptCount - 1];
        delivery.nextRetryAt = new Date(now.getTime() + delayMs);

        this.logger.warn(
          {
            deliveryId: delivery.id,
            paymentId: delivery.paymentId,
            attempt: delivery.attemptCount,
            nextRetryAt: delivery.nextRetryAt,
            event: 'webhook_delivery_failed',
          },
          'Webhook delivery failed, will retry',
        );
      }
    }

    await this.deliveryRepo.save(delivery);
  }

  async findDue(): Promise<WebhookDelivery[]> {
    const now = new Date();
    return this.deliveryRepo.find({
      where: [
        { status: WebhookDeliveryStatus.PENDING, nextRetryAt: LessThanOrEqual(now) },
        { status: WebhookDeliveryStatus.FAILED, nextRetryAt: LessThanOrEqual(now) },
      ],
    });
  }

  async findByPaymentId(paymentId: string): Promise<WebhookDelivery[]> {
    return this.deliveryRepo.find({
      where: { paymentId },
      order: { createdAt: 'DESC' },
    });
  }
}
