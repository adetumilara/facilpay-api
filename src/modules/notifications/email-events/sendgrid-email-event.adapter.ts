import { createPublicKey, createVerify, KeyObject } from 'crypto';
import {
  EmailDeliveryEventType,
  EmailEventAdapter,
  EmailWebhookRequest,
  NormalizedEmailEvent,
  headerValue,
} from './email-event-adapter.interface';

const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * SendGrid Event Webhook adapter.
 *
 * SendGrid signs `timestamp + rawBody` with ECDSA (P-256 / SHA-256). The
 * verification key shown in the SendGrid dashboard is a base64 DER (SPKI)
 * public key and is configured via SENDGRID_WEBHOOK_PUBLIC_KEY.
 */
export class SendGridEmailEventAdapter implements EmailEventAdapter {
  readonly provider = 'sendgrid';
  private readonly publicKey: KeyObject | null;

  constructor(
    publicKey: string | undefined,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.publicKey = publicKey ? SendGridEmailEventAdapter.loadKey(publicKey) : null;
  }

  private static loadKey(key: string): KeyObject | null {
    try {
      if (key.includes('BEGIN PUBLIC KEY')) return createPublicKey(key);
      return createPublicKey({
        key: Buffer.from(key, 'base64'),
        format: 'der',
        type: 'spki',
      });
    } catch {
      return null;
    }
  }

  verify(request: EmailWebhookRequest): boolean {
    if (!this.publicKey) return false;

    const signature = headerValue(
      request.headers,
      'x-twilio-email-event-webhook-signature',
    );
    const timestamp = headerValue(
      request.headers,
      'x-twilio-email-event-webhook-timestamp',
    );
    if (!signature || !timestamp) return false;

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(this.now() / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;

    try {
      return createVerify('sha256')
        .update(timestamp + request.rawBody.toString())
        .verify(this.publicKey, signature, 'base64');
    } catch {
      return false;
    }
  }

  parse(body: unknown): NormalizedEmailEvent[] {
    if (!Array.isArray(body)) return [];

    const result: NormalizedEmailEvent[] = [];
    for (const raw of body) {
      if (typeof raw?.email !== 'string') continue;

      const occurredAt =
        typeof raw.timestamp === 'number'
          ? new Date(raw.timestamp * 1000)
          : new Date(this.now());
      const messageId = typeof raw['smtp-id'] === 'string' ? raw['smtp-id'] : undefined;
      const reason = typeof raw.reason === 'string' ? raw.reason : undefined;

      switch (raw.event) {
        case 'delivered':
          result.push({ type: EmailDeliveryEventType.DELIVERED, email: raw.email, messageId, occurredAt });
          break;
        case 'bounce':
          // SendGrid reports `type: "blocked"` for temporary rejections; those are soft.
          result.push({
            type: EmailDeliveryEventType.BOUNCED,
            email: raw.email,
            messageId,
            bounceType: raw.type === 'blocked' ? 'soft' : 'hard',
            reason,
            occurredAt,
          });
          break;
        case 'dropped':
          result.push({
            type: EmailDeliveryEventType.BOUNCED,
            email: raw.email,
            messageId,
            bounceType: 'soft',
            reason,
            occurredAt,
          });
          break;
        case 'spamreport':
          result.push({ type: EmailDeliveryEventType.COMPLAINED, email: raw.email, messageId, reason, occurredAt });
          break;
        default:
          break;
      }
    }
    return result;
  }
}
