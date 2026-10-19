import { createHmac, timingSafeEqual } from 'crypto';
import {
  EmailDeliveryEventType,
  EmailEventAdapter,
  EmailWebhookRequest,
  NormalizedEmailEvent,
  headerValue,
} from './email-event-adapter.interface';

const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Provider-agnostic adapter. Any relay can post to /v1/email/events using:
 *
 *   X-Email-Webhook-Timestamp: <unix seconds>
 *   X-Email-Webhook-Signature: hex(HMAC-SHA256(EMAIL_WEBHOOK_SECRET, `${timestamp}.${rawBody}`))
 *
 *   { "events": [{ "type": "delivered|bounced|complained", "email": "...",
 *                  "messageId": "...", "bounceType": "hard|soft", "reason": "...",
 *                  "timestamp": "2026-01-01T00:00:00Z" }] }
 */
export class GenericEmailEventAdapter implements EmailEventAdapter {
  readonly provider = 'generic';

  constructor(
    private readonly secret: string | undefined,
    private readonly now: () => number = () => Date.now(),
  ) {}

  verify(request: EmailWebhookRequest): boolean {
    if (!this.secret) return false;

    const signature = headerValue(request.headers, 'x-email-webhook-signature');
    const timestamp = headerValue(request.headers, 'x-email-webhook-timestamp');
    if (!signature || !timestamp) return false;

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(this.now() / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;

    const expected = createHmac('sha256', this.secret)
      .update(`${timestamp}.${request.rawBody.toString()}`)
      .digest('hex');

    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parse(body: unknown): NormalizedEmailEvent[] {
    const events = (body as { events?: unknown })?.events;
    if (!Array.isArray(events)) return [];

    const result: NormalizedEmailEvent[] = [];
    for (const raw of events) {
      const type = this.mapType(raw?.type);
      if (!type || typeof raw?.email !== 'string') continue;

      result.push({
        type,
        email: raw.email,
        messageId: typeof raw.messageId === 'string' ? raw.messageId : undefined,
        bounceType:
          type === EmailDeliveryEventType.BOUNCED
            ? raw.bounceType === 'soft'
              ? 'soft'
              : 'hard'
            : undefined,
        reason: typeof raw.reason === 'string' ? raw.reason : undefined,
        occurredAt: raw.timestamp ? new Date(raw.timestamp) : new Date(this.now()),
      });
    }
    return result;
  }

  private mapType(type: unknown): EmailDeliveryEventType | null {
    switch (type) {
      case 'delivered':
        return EmailDeliveryEventType.DELIVERED;
      case 'bounced':
      case 'bounce':
        return EmailDeliveryEventType.BOUNCED;
      case 'complained':
      case 'complaint':
        return EmailDeliveryEventType.COMPLAINED;
      default:
        return null;
    }
  }
}
