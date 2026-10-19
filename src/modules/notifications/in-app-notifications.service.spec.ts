import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InAppNotificationsService } from './in-app-notifications.service';
import { InAppNotification, InAppNotificationType } from './in-app-notification.entity';
import { AppLogger } from '../logger/logger.service';
import { NotFoundException } from '@nestjs/common';

const mockLogger = { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() }) };

function makeRepo(): jest.Mocked<Partial<Repository<InAppNotification>>> {
  return {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('InAppNotificationsService', () => {
  let service: InAppNotificationsService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InAppNotificationsService,
        { provide: getRepositoryToken(InAppNotification), useValue: repo },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(InAppNotificationsService);
  });

  describe('create', () => {
    it('persists a new notification', async () => {
      const dto = {
        userId: 'user-1',
        type: InAppNotificationType.PAYMENT_RECEIVED,
        title: 'Payment received',
        body: '100 USD',
      };
      const entity = { id: 'notif-1', ...dto, readAt: null, createdAt: new Date() };
      (repo.create as jest.Mock).mockReturnValue(entity);
      (repo.save as jest.Mock).mockResolvedValue(entity);

      const result = await service.create(dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: dto.userId, type: dto.type }),
      );
      expect(repo.save).toHaveBeenCalledWith(entity);
      expect(result.id).toBe('notif-1');
    });
  });

  describe('markRead', () => {
    it('sets readAt when notification is unread', async () => {
      const notif = { id: 'n1', userId: 'u1', readAt: null } as InAppNotification;
      (repo.findOne as jest.Mock).mockResolvedValue(notif);
      (repo.save as jest.Mock).mockImplementation(async (x) => x);

      const result = await service.markRead('n1', 'u1');
      expect(result.readAt).toBeInstanceOf(Date);
    });

    it('returns unchanged notification when already read', async () => {
      const ts = new Date();
      const notif = { id: 'n1', userId: 'u1', readAt: ts } as InAppNotification;
      (repo.findOne as jest.Mock).mockResolvedValue(notif);

      const result = await service.markRead('n1', 'u1');
      expect(result.readAt).toBe(ts);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when notification not found', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.markRead('missing', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getUnreadCount', () => {
    it('returns the count of unread notifications', async () => {
      (repo.count as jest.Mock).mockResolvedValue(4);
      const result = await service.getUnreadCount('u1');
      expect(result).toEqual({ count: 4 });
    });
  });

  describe('markAllRead', () => {
    it('updates all unread notifications', async () => {
      const qb: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 3 }),
      };
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.markAllRead('u1');
      expect(result).toEqual({ updated: 3 });
    });
  });
});
