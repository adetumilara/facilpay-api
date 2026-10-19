import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail/mail.service';
import { LoginAlertActionToken } from './entities/login-alert-action-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { Session } from './entities/session.entity';
import { User } from '../users/user.entity';
import { SessionsService } from '../sessions/sessions.service';
import { LoginAlertsService } from './login-alerts.service';

interface RepositoryMock {
  [method: string]: jest.Mock;
}

interface UpdateBuilderMock {
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  execute: jest.Mock;
}

function createUpdateBuilder(): UpdateBuilderMock {
  const builder: UpdateBuilderMock = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  builder.update.mockReturnValue(builder);
  builder.set.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return builder;
}

describe('LoginAlertsService', () => {
  let service: LoginAlertsService;
  let actionTokens: RepositoryMock;
  let resetTokens: RepositoryMock;
  let sessions: RepositoryMock;
  let users: RepositoryMock;
  let sessionsService: RepositoryMock;
  let mailService: RepositoryMock;
  let configService: RepositoryMock;

  beforeEach(() => {
    actionTokens = {
      create: jest.fn((value: Partial<LoginAlertActionToken>) => value),
      save: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(createUpdateBuilder()),
    };
    resetTokens = {
      create: jest.fn((value: Partial<PasswordResetToken>) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    sessions = { find: jest.fn().mockResolvedValue([]) };
    users = {
      findOneBy: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    sessionsService = {
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };
    mailService = {
      sendNewLoginAlertEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest.fn().mockReturnValue('https://app.example.test'),
    };
    service = new LoginAlertsService(
      actionTokens as unknown as Repository<LoginAlertActionToken>,
      resetTokens as unknown as Repository<PasswordResetToken>,
      sessions as unknown as Repository<Session>,
      users as unknown as Repository<User>,
      sessionsService as unknown as SessionsService,
      mailService as unknown as MailService,
      configService as unknown as ConfigService,
    );
  });

  it('alerts when a device fingerprint has not appeared in prior sessions', async () => {
    const current = {
      id: 'session-new',
      userId: 'user-1',
      deviceFingerprint: 'fingerprint-new',
      countryCode: 'US',
      createdAt: new Date('2026-09-29T10:00:00Z'),
    } as Session;
    sessions.find.mockResolvedValue([
      current,
      {
        id: 'old-session',
        deviceFingerprint: 'fingerprint-old',
        countryCode: 'US',
      },
    ]);

    const sent = await service.sendAlertIfNeeded(
      {
        id: 'user-1',
        email: 'user@example.test',
        loginAlertsEnabled: true,
      } as User,
      current,
    );

    expect(sent).toBe(true);
    expect(actionTokens.save).toHaveBeenCalledTimes(1);
    expect(mailService.sendNewLoginAlertEmail).toHaveBeenCalledWith(
      'user@example.test',
      expect.objectContaining({ countryCode: 'US' }),
    );
  });

  it('still alerts on a new country when device alerts are disabled', async () => {
    const current = {
      id: 'session-new',
      userId: 'user-1',
      deviceFingerprint: 'fingerprint-same',
      countryCode: 'GB',
    } as Session;
    sessions.find.mockResolvedValue([
      current,
      {
        id: 'old-session',
        deviceFingerprint: 'fingerprint-same',
        countryCode: 'US',
      },
    ]);

    const sent = await service.sendAlertIfNeeded(
      {
        id: 'user-1',
        email: 'user@example.test',
        loginAlertsEnabled: false,
      } as User,
      current,
    );

    expect(sent).toBe(true);
    expect(mailService.sendNewLoginAlertEmail).toHaveBeenCalledTimes(1);
  });

  it('does not send a device alert when opted out and the country is known', async () => {
    const current = {
      id: 'session-new',
      userId: 'user-1',
      deviceFingerprint: 'fingerprint-new',
      countryCode: 'US',
    } as Session;
    sessions.find.mockResolvedValue([
      current,
      {
        id: 'old-session',
        deviceFingerprint: 'fingerprint-old',
        countryCode: 'US',
      },
    ]);

    const sent = await service.sendAlertIfNeeded(
      {
        id: 'user-1',
        email: 'user@example.test',
        loginAlertsEnabled: false,
      } as User,
      current,
    );

    expect(sent).toBe(false);
    expect(mailService.sendNewLoginAlertEmail).not.toHaveBeenCalled();
  });

  it('revokes all sessions and starts password reset from a valid report token', async () => {
    actionTokens.findOne.mockResolvedValue({
      id: 'action-1',
      userId: 'user-1',
    });
    users.findOneBy.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
    });

    const result = await service.reportNotMe('raw-alert-token');

    expect(actionTokens.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(sessionsService.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(users.update).toHaveBeenCalledWith(
      { id: 'user-1' },
      { passwordResetRequired: true },
    );
    expect(resetTokens.save).toHaveBeenCalledTimes(1);
    expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'user@example.test',
      expect.any(String),
    );
    expect(result.message).toContain('password reset email');
  });
});
