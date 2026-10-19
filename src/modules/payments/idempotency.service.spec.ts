import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyService } from './idempotency.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IdempotencyKey } from './idempotency.entity';
import { ConfigService } from '@nestjs/config';
import { UnprocessableEntityException } from '@nestjs/common';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockRepository: any;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: getRepositoryToken(IdempotencyKey),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(24),
          },
        },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
  });

  it('should return null for new key', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    const result = await service.checkKey('key1', { amount: 100 });

    expect(result).toBeNull();
  });

  it('should return cached response for existing key with same body', async () => {
    const requestBody = { amount: 100, currency: 'USD' };
    const requestHash = service.hashRequest(requestBody);
    const cachedResponse = { id: '123', status: 'PENDING' };

    mockRepository.findOne.mockResolvedValue({
      key: 'key1',
      requestHash,
      response: cachedResponse,
      expiresAt: new Date(Date.now() + 3600000),
    });

    const result = await service.checkKey('key1', requestBody);

    expect(result).toEqual(cachedResponse);
  });

  it('should throw 422 for key reused with different body', async () => {
    const originalBody = { amount: 100, currency: 'USD' };
    const differentBody = { amount: 200, currency: 'USD' };
    const originalHash = service.hashRequest(originalBody);

    mockRepository.findOne.mockResolvedValue({
      key: 'key1',
      requestHash: originalHash,
      response: { id: '123' },
      expiresAt: new Date(Date.now() + 3600000),
    });

    await expect(service.checkKey('key1', differentBody)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('should delete and return null for expired key', async () => {
    mockRepository.findOne.mockResolvedValue({
      key: 'key1',
      requestHash: 'hash',
      response: { id: '123' },
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await service.checkKey('key1', { amount: 100 });

    expect(mockRepository.delete).toHaveBeenCalledWith({ key: 'key1' });
    expect(result).toBeNull();
  });

  it('should store key with correct expiry', async () => {
    const requestBody = { amount: 100, currency: 'USD' };
    const response = { id: '123', status: 'PENDING' };

    mockRepository.create.mockReturnValue({
      key: 'key1',
      requestHash: service.hashRequest(requestBody),
      response,
      expiresAt: expect.any(Date),
    });

    await service.storeKey('key1', requestBody, response);

    expect(mockRepository.save).toHaveBeenCalled();
  });
});
