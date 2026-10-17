import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreference, NotificationCategory } from './notification-preference.entity';

function makeRepo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    upsert: jest.fn(),
  };
}

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferencesService,
        { provide: getRepositoryToken(NotificationPreference), useValue: repo },
      ],
    }).compile();
    service = module.get(NotificationPreferencesService);
  });

  describe('getForUser', () => {
    it('returns all defaults when no preferences stored', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      const prefs = await service.getForUser('u1');
      expect(prefs[NotificationCategory.PAYMENTS]).toBe(true);
      expect(prefs[NotificationCategory.SECURITY]).toBe(true);
    });

    it('returns stored preferences', async () => {
      (repo.find as jest.Mock).mockResolvedValue([
        { category: NotificationCategory.REPORTS, email: false },
      ]);
      const prefs = await service.getForUser('u1');
      expect(prefs[NotificationCategory.REPORTS]).toBe(false);
      expect(prefs[NotificationCategory.PAYMENTS]).toBe(true);
    });

    it('always forces security to true regardless of stored value', async () => {
      (repo.find as jest.Mock).mockResolvedValue([
        { category: NotificationCategory.SECURITY, email: false },
      ]);
      const prefs = await service.getForUser('u1');
      expect(prefs[NotificationCategory.SECURITY]).toBe(true);
    });
  });

  describe('isEmailEnabled', () => {
    it('always returns true for security', async () => {
      const result = await service.isEmailEnabled('u1', NotificationCategory.SECURITY);
      expect(result).toBe(true);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('returns true when no preference row exists (opt-in by default)', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      const result = await service.isEmailEnabled('u1', NotificationCategory.PAYMENTS);
      expect(result).toBe(true);
    });

    it('returns false when preference is disabled', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        category: NotificationCategory.DISPUTES,
        email: false,
      });
      const result = await service.isEmailEnabled('u1', NotificationCategory.DISPUTES);
      expect(result).toBe(false);
    });
  });

  describe('updateForUser', () => {
    it('skips security category updates', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      (repo.upsert as jest.Mock).mockResolvedValue({});
      await service.updateForUser('u1', {
        [NotificationCategory.SECURITY]: false,
        [NotificationCategory.PAYMENTS]: false,
      });
      expect(repo.upsert).toHaveBeenCalledTimes(1);
      const call = (repo.upsert as jest.Mock).mock.calls[0][0];
      expect(call.category).toBe(NotificationCategory.PAYMENTS);
    });
  });
});
