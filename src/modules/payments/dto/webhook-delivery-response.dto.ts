import { ApiProperty } from '@nestjs/swagger';
import { WebhookDeliveryStatus } from '../webhook-delivery.entity';

export class WebhookDeliveryResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  paymentId: string;

  @ApiProperty({ example: 'https://merchant.example.com/webhooks/payment' })
  callbackUrl: string;

  @ApiProperty({
    description: 'Snapshot of the payment status payload sent in the webhook body',
    example: { paymentId: '...', status: 'COMPLETED', amount: 100.5, currency: 'USD' },
  })
  payload: Record<string, unknown>;

  @ApiProperty({ enum: WebhookDeliveryStatus, example: WebhookDeliveryStatus.DELIVERED })
  status: WebhookDeliveryStatus;

  @ApiProperty({ example: 1 })
  attemptCount: number;

  @ApiProperty({ nullable: true, example: '2026-06-20T10:05:00.000Z' })
  lastAttemptAt: Date | null;

  @ApiProperty({ nullable: true, example: '2026-06-20T10:06:00.000Z' })
  nextRetryAt: Date | null;

  @ApiProperty({ nullable: true, example: 200 })
  lastStatusCode: number | null;

  @ApiProperty({ nullable: true, example: 'connect ECONNREFUSED 127.0.0.1:3001' })
  lastError: string | null;

  @ApiProperty({ example: '2026-06-20T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-06-20T10:05:00.000Z' })
  updatedAt: Date;
}
