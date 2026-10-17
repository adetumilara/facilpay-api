import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserSecurityService } from './user-security.service';
import { User } from './user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Session } from '../auth/entities/session.entity';
import { PasswordStrengthService } from '../auth/password-strength.service';
import { PasswordHistoryService } from '../auth/password-history.service';
import { MailService } from '../auth/mail/mail.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AppLogger } from '../logger/logger.service';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
});

const makeUser = (overrides: Partial<User> = {}): User => {
  const u = new User();
  u.id = 'user-id-1';
  u.email = 'jane@example.com';
  u.password = '$2b$10$dummyhash';
  u.isEmailVerified = true;
  u.isActive = true;
  u.deletedAt = null;
  u.roles = ['USER' as any];
  u.pendingEmail = null;
  u.emailChangeToken = null;
  u.emailChangeTokenExpiresAt = null;
  u.dataExportRequestedAt = null;
  return Object.assign(u, overrides);
};

describe('UserSecurityService', () => {
  let service: UserSecurityService;
  let userRepo: ReturnType<typeof mockRepo>;
  let refreshTokenRepo: ReturnType<typeof mockRepo>;
  let sessionRepo: ReturnType<typeof mockRepo>;
  let passwordStrengthService: jest.Mocked<PasswordStrengthService>;
  let passwordHistoryService: jest.Mocked<PasswordHistoryService>;
  let mailService: jest.Mocked<MailService>;
  let jwtService: jest.Mocked<JwtService>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    userRepo = mockRepo();
    refreshTokenRepo = mockRepo();
    sessionRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSecurityService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepo },
        { provide: getRepositoryToken(Session), useValue: sessionRepo },
        {
          provide: PasswordStrengthService,
          useValue: { validateAndScore: jest.fn().mockResolvedValue({ score: 3, feedback: [] }) },
        },
        {
          provide: PasswordHistoryService,
          useValue: {
            validatePasswordNotReused: jest.fn().mockResolvedValue(undefined),
            recordPasswordChange: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendSecurityAlertEmail: jest.fn().mockResolvedValue(undefined),
            sendEmailChangeConfirmation: jest.fn().mockResolvedValue(undefined),
            sendEmailChangeNotice: jest.fn().mockResolvedValue(undefined),
            sendDataExportReadyEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            getRepository: jest.fn().mockReturnValue({
              find: jest.fn().mockResolvedValue([]),
            }),
          },
        },
        {
          provide: AuditLogsService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: AppLogger,
          useValue: {
            child: jest.fn().mockReturnValue({
              info: jest.fn(),
              warn: jest.fn(),
              error: jest.fn(),
              debug: jest.fn(),
            }),
          },
        },
      ],
    }).compile();

    service = module.get(UserSecurityService);
    passwordStrengthService = module.get(PasswordStrengthService);
    passwordHistoryService = module.get(PasswordHistoryService);
    mailService = module.get(MailService);
    jwtService = module.get(JwtService);
    dataSource = module.get(DataSource);
  });

  // ─── #429 Change password ───────────────────────────────────────────────────

  describe('changePassword()', () => {
    const CURRENT = 'Curr3nt@Pss!';
    const NEW_PASS = 'N3wP@ssw0rd!2026';

    it('rejects a wrong current password with 401', async () => {
      const user = makeUser();
      user.password = await bcrypt.hash(CURRENT, 10);
      userRepo.findOne.mockResolvedValue(user);

      await expect(
        service.changePassword(user.id, 'WrongPass!', NEW_PASS),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a weak new password via PasswordStrengthService', async () => {
      const user = makeUser();
      user.password = await bcrypt.hash(CURRENT, 10);
      userRepo.findOne.mockResolvedValue(user);
      (passwordStrengthService.validateAndScore as jest.Mock).mockRejectedValueOnce(
        new BadRequestException('Too weak'),
      );

      await expect(
        service.changePassword(user.id, CURRENT, 'weak'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a reused password', async () => {
      const user = makeUser();
      user.password = await bcrypt.hash(CURRENT, 10);
      userRepo.findOne.mockResolvedValue(user);

      // Simulate password history match
      const hashedNew = await bcrypt.hash(NEW_PASS, 10);
      (dataSource.getRepository as jest.Mock).mockReturnValue({
        find: jest.fn().mockResolvedValue([{ passwordHash: hashedNew }]),
      });

      await expect(
        service.changePassword(user.id, CURRENT, NEW_PASS),
      ).rejects.toThrow(BadRequestException);
    });

    it('changes password and revokes sessions on success', async () => {
      const user = makeUser();
      user.password = await bcrypt.hash(CURRENT, 10);
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue(user);
      refreshTokenRepo.update.mockResolvedValue({ affected: 1 });
      sessionRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.changePassword(user.id, CURRENT, NEW_PASS);

      expect(result.message).toContain('Password changed');
      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { userId: user.id },
        { revoked: true },
      );
      expect(sessionRepo.update).toHaveBeenCalledWith(
        { userId: user.id },
        { revoked: true },
      );
      expect(mailService.sendSecurityAlertEmail).toHaveBeenCalled();
    });
  });

  // ─── #428 Change email ───────────────────────────────────────────────────────

  describe('initiateEmailChange()', () => {
    it('rejects wrong password with 401', async () => {
      const user = makeUser();
      user.password = await bcrypt.hash('Correct!Pass1', 10);
      userRepo.findOne.mockResolvedValueOnce(user);

      await expect(
        service.initiateEmailChange(user.id, 'new@example.com', 'Wrong!Pass'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects if new email equals current email', async () => {
      const user = makeUser();
      user.password = await bcrypt.hash('Correct!Pass1', 10);
      userRepo.findOne.mockResolvedValueOnce(user);

      await expect(
        service.initiateEmailChange(user.id, 'jane@example.com', 'Correct!Pass1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate new email with 409', async () => {
      const user = makeUser();
      user.password = await bcrypt.hash('Correct!Pass1', 10);
      userRepo.findOne
        .mockResolvedValueOnce(user) // findOne for the requesting user
        .mockResolvedValueOnce(makeUser({ email: 'taken@example.com' })); // uniqueness check

      await expect(
        service.initiateEmailChange(user.id, 'taken@example.com', 'Correct!Pass1'),
      ).rejects.toThrow(ConflictException);
    });

    it('stores pending email and sends confirmation + notice emails', async () => {
      const user = makeUser();
      user.password = await bcrypt.hash('Correct!Pass1', 10);
      userRepo.findOne
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(null); // uniqueness check → available
      userRepo.save.mockResolvedValue(user);

      const result = await service.initiateEmailChange(
        user.id,
        'new@example.com',
        'Correct!Pass1',
      );

      expect(result.message).toContain('confirmation link');
      expect(user.pendingEmail).toBe('new@example.com');
      expect(mailService.sendEmailChangeConfirmation).toHaveBeenCalledWith(
        'new@example.com',
        'signed-token',
        'new@example.com',
      );
      expect(mailService.sendEmailChangeNotice).toHaveBeenCalled();
    });
  });

  describe('confirmEmailChange()', () => {
    it('rejects an invalid/expired token', async () => {
      (jwtService.verify as jest.Mock).mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      await expect(service.confirmEmailChange('bad-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a token that no longer matches the stored one', async () => {
      (jwtService.verify as jest.Mock).mockReturnValueOnce({
        sub: 'user-id-1',
        newEmail: 'new@example.com',
        purpose: 'email-change-confirm',
      });
      const user = makeUser();
      user.emailChangeToken = 'different-token';
      user.emailChangeTokenExpiresAt = new Date(Date.now() + 60_000);
      userRepo.findOne.mockResolvedValueOnce(user);

      await expect(service.confirmEmailChange('my-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('swaps the email and revokes sessions on valid token', async () => {
      const token = 'valid-token';
      (jwtService.verify as jest.Mock).mockReturnValueOnce({
        sub: 'user-id-1',
        newEmail: 'new@example.com',
        purpose: 'email-change-confirm',
      });
      const user = makeUser();
      user.emailChangeToken = token;
      user.emailChangeTokenExpiresAt = new Date(Date.now() + 60_000);
      userRepo.findOne
        .mockResolvedValueOnce(user) // find requesting user
        .mockResolvedValueOnce(null); // uniqueness check
      userRepo.save.mockResolvedValue(user);
      refreshTokenRepo.update.mockResolvedValue({ affected: 1 });
      sessionRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.confirmEmailChange(token);

      expect(result.message).toContain('Email address updated');
      expect(user.email).toBe('new@example.com');
      expect(user.pendingEmail).toBeNull();
      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { userId: user.id },
        { revoked: true },
      );
    });
  });

  // ─── #427 Data export ────────────────────────────────────────────────────────

  describe('requestDataExport()', () => {
    it('rejects wrong password with 401', async () => {
      const user = makeUser();
      user.password = await bcrypt.hash('Right!Pass', 10);
      userRepo.findOne.mockResolvedValue(user);

      await expect(
        service.requestDataExport(user.id, 'Wrong!Pass'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rate-limits to one export per 24 h', async () => {
      const user = makeUser();
      user.password = await bcrypt.hash('Right!Pass', 10);
      user.dataExportRequestedAt = new Date(Date.now() - 3600 * 1000); // 1 h ago
      userRepo.findOne.mockResolvedValue(user);

      await expect(
        service.requestDataExport(user.id, 'Right!Pass'),
      ).rejects.toThrow(BadRequestException);
    });

    it('sends download link email on success', async () => {
      const user = makeUser();
      user.password = await bcrypt.hash('Right!Pass', 10);
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue(user);

      const result = await service.requestDataExport(user.id, 'Right!Pass');

      expect(result.message).toContain('download link');
      expect(mailService.sendDataExportReadyEmail).toHaveBeenCalled();
    });
  });

  describe('downloadDataExport()', () => {
    it('rejects an expired download token', async () => {
      (jwtService.verify as jest.Mock).mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      await expect(service.downloadDataExport('bad-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns redacted profile (no password/2FA secret)', async () => {
      (jwtService.verify as jest.Mock).mockReturnValueOnce({
        sub: 'user-id-1',
        purpose: 'data-export-download',
      });
      const user = makeUser();
      user.password = 'hashed-secret';
      user.twoFactorSecret = 'totp-secret';
      user.backupCodes = ['code1', 'code2'];
      userRepo.findOne.mockResolvedValue(user);
      sessionRepo.find = jest.fn().mockResolvedValue([]);

      const result = await service.downloadDataExport('valid-token');

      expect((result.profile as any).password).toBeUndefined();
      expect((result.profile as any).twoFactorSecret).toBeUndefined();
      expect((result.profile as any).backupCodes).toBeUndefined();
      expect(result.exportedAt).toBeDefined();
      expect(Array.isArray(result.sessions)).toBe(true);
    });
  });
});
