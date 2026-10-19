import { createHmac, createSign, generateKeyPairSync } from 'crypto';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailEventsService } from './email-events.service';
import { EmailLogStatus } from '../email-log.entity';
import { EmailSuppressionReason } from '../email-suppression.entity';
import { GenericEmailEventAdapter } from './generic-email-event.adapter';
import { SendGridEmailEventAdapter } from './sendgrid-email-event.adapter';
import { EmailDeliveryEventType } from './email-event-adapter.interface';

const SECRET = 'test-email-webhook-secret';

const mockLogger = {
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
};

function signGeneric(rawBody: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return {
    'x-email-webhook-signature': signature,
    'x-email-webhook-timestamp': String(timestamp),
  };
}

describe('EmailEventsService', () => {
  let service: EmailEventsService;
  let emailLogRepo: { findOne: jest.Mock; save: jest.Mock };
  let suppressionRepo: {
    count: jest.Mock;
    delete: jest.Mock;
    findAndCount: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let insertValues: jest.Mock;
  let insertResultRaw: unknown[];

  beforeEach(() => {
    emailLogRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (log) => log),
    };
    insertResultRaw = [{ id: 'sup-1' }];
    insertValues = jest.fn().mockReturnThis();
    const qb = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: insertValues,
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ raw: insertResultRaw, identifiers: [] })),
    };
    suppressionRepo = {
      count: jest.fn(),
      delete: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    const config = {
      get: jest.fn((key: string) => (key === 'EMAIL_WEBHOOK_SECRET' ? SECRET : undefined)),
    } as unknown as ConfigService;

    service = new EmailEventsService(
      emailLogRepo as any,
      suppressionRepo as any,
      config,
      mockLogger as any,
    );
  });

  describe('signature verification', () => {
    it('rejects a generic webhook with a bad signature', async () => {
      const rawBody = JSON.stringify({ events: [] });
      await expect(
        service.handleWebhook('generic', {
          headers: {
            'x-email-webhook-signature': 'deadbeef',
            'x-email-webhook-timestamp': String(Math.floor(Date.now() / 1000)),
          },
          rawBody,
          body: JSON.parse(rawBody),
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a generic webhook with missing headers', async () => {
      await expect(
        service.handleWebhook('generic', { headers: {}, rawBody: '{}', body: {} }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a stale timestamp even when the signature matches', async () => {
      const rawBody = JSON.stringify({ events: [] });
      const stale = Math.floor(Date.now() / 1000) - 3600;
      await expect(
        service.handleWebhook('generic', {
          headers: signGeneric(rawBody, stale),
          rawBody,
          body: JSON.parse(rawBody),
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown provider', async () => {
      await expect(
        service.handleWebhook('mailchimp', { headers: {}, rawBody: '', body: {} }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('verifies SendGrid ECDSA signatures', () => {
      const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const der = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
      const adapter = new SendGridEmailEventAdapter(der);
      const rawBody = JSON.stringify([{ email: 'a@example.com', event: 'delivered' }]);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createSign('sha256').update(timestamp + rawBody).sign(privateKey, 'base64');

      const headers = {
        'x-twilio-email-event-webhook-signature': signature,
        'x-twilio-email-event-webhook-timestamp': timestamp,
      };
      expect(adapter.verify({ headers, rawBody, body: JSON.parse(rawBody) })).toBe(true);
      expect(
        adapter.verify({ headers, rawBody: rawBody + ' ', body: JSON.parse(rawBody) }),
      ).toBe(false);
    });
  });

  describe('event types', () => {
    const sentLog = () => ({
      id: 'log-1',
      recipientEmail: 'payer@example.com',
      status: EmailLogStatus.SENT,
      providerMessageId: '<msg-1@facilpay>',
      errorMessage: null,
      statusUpdatedAt: null,
    });

    async function post(events: Record<string, unknown>[]) {
      const rawBody = JSON.stringify({ events });
      return service.handleWebhook('generic', {
        headers: signGeneric(rawBody),
        rawBody,
        body: JSON.parse(rawBody),
      });
    }

    it('marks DELIVERED without suppressing', async () => {
      const log = sentLog();
      emailLogRepo.findOne.mockResolvedValue(log);

      const result = await post([
        { type: 'delivered', email: 'payer@example.com', messageId: '<msg-1@facilpay>' },
      ]);

      expect(log.status).toBe(EmailLogStatus.DELIVERED);
      expect(emailLogRepo.findOne).toHaveBeenCalledWith({
        where: { providerMessageId: '<msg-1@facilpay>' },
      });
      expect(suppressionRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toEqual({ received: 1, processed: 1, suppressed: 0 });
    });

    it('hard bounce marks BOUNCED and suppresses the address', async () => {
      const log = sentLog();
      emailLogRepo.findOne.mockResolvedValue(log);

      const result = await post([
        { type: 'bounced', bounceType: 'hard', email: 'Payer@Example.com', reason: '550 user unknown' },
      ]);

      expect(log.status).toBe(EmailLogStatus.BOUNCED);
      expect(log.errorMessage).toBe('550 user unknown');
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'payer@example.com',
          reason: EmailSuppressionReason.HARD_BOUNCE,
          provider: 'generic',
        }),
      );
      expect(result.suppressed).toBe(1);
    });

    it('soft bounce marks BOUNCED but does not suppress', async () => {
      const log = sentLog();
      emailLogRepo.findOne.mockResolvedValue(log);

      const result = await post([
        { type: 'bounced', bounceType: 'soft', email: 'payer@example.com' },
      ]);

      expect(log.status).toBe(EmailLogStatus.BOUNCED);
      expect(suppressionRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(result.suppressed).toBe(0);
    });

    it('complaint marks COMPLAINED and suppresses the address', async () => {
      const log = sentLog();
      emailLogRepo.findOne.mockResolvedValue(log);

      const result = await post([{ type: 'complained', email: 'payer@example.com' }]);

      expect(log.status).toBe(EmailLogStatus.COMPLAINED);
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ reason: EmailSuppressionReason.COMPLAINT }),
      );
      expect(result.suppressed).toBe(1);
    });

    it('does not count an already-suppressed address twice', async () => {
      emailLogRepo.findOne.mockResolvedValue(sentLog());
      insertResultRaw = [];

      const result = await post([{ type: 'complained', email: 'payer@example.com' }]);

      expect(result.suppressed).toBe(0);
    });

    it('a late delivered event does not overwrite a bounce', async () => {
      const log = { ...sentLog(), status: EmailLogStatus.BOUNCED };
      emailLogRepo.findOne.mockResolvedValue(log);

      const result = await post([{ type: 'delivered', email: 'payer@example.com' }]);

      expect(log.status).toBe(EmailLogStatus.BOUNCED);
      expect(emailLogRepo.save).not.toHaveBeenCalled();
      expect(result.processed).toBe(0);
    });

    it('still suppresses when no matching email log exists', async () => {
      emailLogRepo.findOne.mockResolvedValue(null);

      const result = await post([{ type: 'bounced', email: 'ghost@example.com' }]);

      expect(result).toEqual({ received: 1, processed: 0, suppressed: 1 });
    });
  });

  describe('SendGrid payload parsing', () => {
    it('maps SendGrid events to normalized events', () => {
      const adapter = new SendGridEmailEventAdapter(undefined);
      const events = adapter.parse([
        { email: 'a@example.com', event: 'delivered', timestamp: 1700000000, 'smtp-id': '<a@x>' },
        { email: 'b@example.com', event: 'bounce', type: 'bounce', reason: '550' },
        { email: 'c@example.com', event: 'bounce', type: 'blocked' },
        { email: 'd@example.com', event: 'spamreport' },
        { email: 'e@example.com', event: 'open' },
      ]);

      expect(events.map((e) => [e.email, e.type, e.bounceType])).toEqual([
        ['a@example.com', EmailDeliveryEventType.DELIVERED, undefined],
        ['b@example.com', EmailDeliveryEventType.BOUNCED, 'hard'],
        ['c@example.com', EmailDeliveryEventType.BOUNCED, 'soft'],
        ['d@example.com', EmailDeliveryEventType.COMPLAINED, undefined],
      ]);
      expect(events[0].messageId).toBe('<a@x>');
      expect(events[0].occurredAt.toISOString()).toBe('2023-11-14T22:13:20.000Z');
    });

    it('generic adapter defaults bounces to hard', () => {
      const adapter = new GenericEmailEventAdapter(SECRET);
      const [event] = adapter.parse({ events: [{ type: 'bounced', email: 'x@example.com' }] });
      expect(event.bounceType).toBe('hard');
    });
  });

  describe('suppression admin', () => {
    it('throws when removing an unknown suppression', async () => {
      suppressionRepo.delete.mockResolvedValue({ affected: 0 });
      await expect(service.removeSuppression('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('checks suppression case-insensitively', async () => {
      suppressionRepo.count.mockResolvedValue(1);
      await expect(service.isSuppressed(' Payer@Example.COM ')).resolves.toBe(true);
      expect(suppressionRepo.count).toHaveBeenCalledWith({
        where: { email: 'payer@example.com' },
      });
    });
  });
});
