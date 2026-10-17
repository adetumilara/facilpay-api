import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { Payment, PaymentStatus } from './payment.entity';
import { AppLogger } from '../logger/logger.service';
import { MerchantsService } from '../merchants/merchants.service';

describe('InvoiceService', () => {
  let service: InvoiceService;
  let paymentRepository: jest.Mocked<Pick<Repository<Payment>, 'findOneBy' | 'save'>>;

  const mockLogger = {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  };

  const makePayment = (overrides: Partial<Payment> = {}): Payment =>
    ({
      id: 'test-payment-uuid-1234',
      amount: 100.5,
      currency: 'USD',
      status: PaymentStatus.COMPLETED,
      description: 'Test payment',
      externalReference: 'ext-ref-001',
      merchantId: 'merchant-uuid-001',
      merchantEmail: 'merchant@example.com',
      payerEmail: 'payer@example.com',
      feeAmount: 1.5,
      netAmount: 99.0,
      invoiceToken: null,
      createdAt: new Date('2026-01-26T10:00:00.000Z'),
      updatedAt: new Date('2026-01-26T10:05:00.000Z'),
      ...overrides,
    } as Payment);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            findOneBy: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: MerchantsService,
          useValue: { getBrandingWithDefaults: jest.fn() },
        },
        {
          provide: AppLogger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<InvoiceService>(InvoiceService);
    paymentRepository = module.get(getRepositoryToken(Payment));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreateInvoiceToken', () => {
    it('should throw NotFoundException when payment does not exist', async () => {
      (paymentRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getOrCreateInvoiceToken('non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when payment is not COMPLETED', async () => {
      const payment = makePayment({ status: PaymentStatus.PENDING });
      (paymentRepository.findOneBy as jest.Mock).mockResolvedValue(payment);

      await expect(
        service.getOrCreateInvoiceToken(payment.id),
      ).rejects.toThrow(ConflictException);
    });

    it('should generate and persist a new invoice token when none exists', async () => {
      const payment = makePayment({ invoiceToken: null });
      (paymentRepository.findOneBy as jest.Mock).mockResolvedValue(payment);
      (paymentRepository.save as jest.Mock).mockImplementation(async (p) => p);

      const result = await service.getOrCreateInvoiceToken(payment.id);

      expect(result.invoiceToken).toBeDefined();
      expect(typeof result.invoiceToken).toBe('string');
      expect(result.invoiceToken).toHaveLength(64); // 32 bytes → 64 hex chars
      expect(paymentRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should return the existing token without generating a new one when token already exists', async () => {
      const existingToken = 'a'.repeat(64);
      const payment = makePayment({ invoiceToken: existingToken });
      (paymentRepository.findOneBy as jest.Mock).mockResolvedValue(payment);

      const result = await service.getOrCreateInvoiceToken(payment.id);

      expect(result.invoiceToken).toBe(existingToken);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('should return the payment record with the token populated', async () => {
      const payment = makePayment({ invoiceToken: 'b'.repeat(64) });
      (paymentRepository.findOneBy as jest.Mock).mockResolvedValue(payment);

      const result = await service.getOrCreateInvoiceToken(payment.id);

      expect(result).toEqual(payment);
    });
  });

  describe('findPaymentByToken', () => {
    it('should throw NotFoundException when no payment matches the token', async () => {
      (paymentRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(
        service.findPaymentByToken('invalid-token'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return the payment when the token matches', async () => {
      const token = 'c'.repeat(64);
      const payment = makePayment({ invoiceToken: token });
      (paymentRepository.findOneBy as jest.Mock).mockResolvedValue(payment);

      const result = await service.findPaymentByToken(token);

      expect(result).toEqual(payment);
      expect(paymentRepository.findOneBy).toHaveBeenCalledWith({
        invoiceToken: token,
      });
    });
  });

  describe('streamInvoicePdf', () => {
    it('should set Content-Type and Content-Disposition headers and pipe the PDF', async () => {
      const payment = makePayment({ invoiceToken: 'd'.repeat(64) });

      // Provide a minimal writable stream so doc.pipe(res) does not throw
      const { PassThrough } = require('stream');
      const passThrough = new PassThrough();
      const setHeaderMock = jest.fn();
      const mockRes = Object.assign(passThrough, {
        setHeader: setHeaderMock,
      }) as unknown as import('express').Response;

      // Should not throw
      await expect(service.streamInvoicePdf(payment, mockRes)).resolves.toBeUndefined();

      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('inline; filename="invoice-'),
      );
    });
  });
});
