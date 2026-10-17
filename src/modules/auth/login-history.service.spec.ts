import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LoginHistoryService } from './login-history.service';
import { LoginEvent } from './entities/login-event.entity';

const mockRepo = () => ({
  create: jest.fn((v) => v),
  save: jest.fn(async (v) => ({ ...v, id: 'event-id', createdAt: new Date() })),
  findAndCount: jest.fn(),
  delete: jest.fn(),
});

describe('LoginHistoryService', () => {
  let service: LoginHistoryService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    repo = mockRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginHistoryService,
        { provide: getRepositoryToken(LoginEvent), useValue: repo },
      ],
    }).compile();

    service = module.get(LoginHistoryService);
  });

  it('records a successful login event', async () => {
    await service.record({
      userId: 'user-1',
      success: true,
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', success: true }),
    );
    expect(repo.save).toHaveBeenCalled();
  });

  it('records a failed login event with reason', async () => {
    await service.record({
      userId: 'user-1',
      success: false,
      reason: 'bad_password',
      ipAddress: '1.2.3.4',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, reason: 'bad_password' }),
    );
  });

  it('records a failed login event with null userId for unknown user', async () => {
    await service.record({ userId: null, success: false, reason: 'user_not_found' });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, reason: 'user_not_found' }),
    );
  });

  it('findForUser returns only events for the given user', async () => {
    const mockEvents = [{ id: 'e1', userId: 'user-1', success: true, createdAt: new Date() }];
    repo.findAndCount.mockResolvedValue([mockEvents, 1]);

    const result = await service.findForUser('user-1', { page: 1, limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });

  it('findForUser with failuresOnly filters on success=false', async () => {
    repo.findAndCount.mockResolvedValue([[], 0]);
    await service.findForUser('user-1', { failuresOnly: true });

    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ success: false }),
      }),
    );
  });

  it('purgeOldEvents removes events older than 90 days', async () => {
    repo.delete.mockResolvedValue({ affected: 5 });
    const removed = await service.purgeOldEvents();
    expect(removed).toBe(5);
    expect(repo.delete).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: expect.anything() }),
    );
  });
});
