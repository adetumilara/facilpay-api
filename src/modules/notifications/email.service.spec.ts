import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailEventType, EmailLogStatus } from './email-log.entity';

const mockLogger = {
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
};

describe('EmailService', () => {
  let service: EmailService;
  let mailer: { sendMail: jest.Mock };
  let emailLogRepo: { save: jest.Mock };
  let suppressionRepo: { count: jest.Mock };

  const options = {
    to: 'Payer@Example.com',
    subject: 'Payment Confirmed',
    templateName: 'payer-payment-confirmed',
    templateData: {},
    eventType: EmailEventType.PAYMENT_CONFIRMED,
    recipientRole: 'payer',
    paymentId: 'pay-1',
  };

  beforeEach(() => {
    mailer = { sendMail: jest.fn().mockResolvedValue({ messageId: '<abc@facilpay>' }) };
    emailLogRepo = { save: jest.fn() };
    suppressionRepo = { count: jest.fn().mockResolvedValue(0) };
    const config = { get: jest.fn((_key: string, def?: unknown) => def) } as unknown as ConfigService;

    service = new EmailService(
      mailer as any,
      config,
      emailLogRepo as any,
      suppressionRepo as any,
      mockLogger as any,
    );
  });

  it('skips suppressed recipients and logs SUPPRESSED', async () => {
    suppressionRepo.count.mockResolvedValue(1);

    await service.sendEmail(options);

    expect(suppressionRepo.count).toHaveBeenCalledWith({
      where: { email: 'payer@example.com' },
    });
    expect(mailer.sendMail).not.toHaveBeenCalled();
    expect(emailLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: EmailLogStatus.SUPPRESSED }),
    );
  });

  it('stores the provider message id on successful sends', async () => {
    await service.sendEmail(options);

    expect(mailer.sendMail).toHaveBeenCalled();
    expect(emailLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: EmailLogStatus.SENT,
        providerMessageId: '<abc@facilpay>',
      }),
    );
  });
});
