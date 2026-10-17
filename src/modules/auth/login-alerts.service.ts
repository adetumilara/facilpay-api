import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { MailService } from './mail/mail.service';
import { LoginAlertActionToken } from './entities/login-alert-action-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { Session } from './entities/session.entity';
import { User } from '../users/user.entity';
import { SessionsService } from '../sessions/sessions.service';

const ALERT_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

@Injectable()
export class LoginAlertsService {
  constructor(
    @InjectRepository(LoginAlertActionToken)
    private readonly actionTokenRepository: Repository<LoginAlertActionToken>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly sessionsService: SessionsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async sendAlertIfNeeded(user: User, session: Session): Promise<boolean> {
    const sessions = await this.sessionRepository.find({
      where: { userId: user.id },
    });
    const previousSessions = sessions.filter((item) => item.id !== session.id);
    const newDevice =
      !!session.deviceFingerprint &&
      !previousSessions.some(
        (item) => item.deviceFingerprint === session.deviceFingerprint,
      );
    const newCountry =
      !!session.countryCode &&
      !previousSessions.some(
        (item) => item.countryCode === session.countryCode,
      );

    if (!newCountry && !(newDevice && user.loginAlertsEnabled !== false)) {
      return false;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.actionTokenRepository.save(
      this.actionTokenRepository.create({
        userId: user.id,
        sessionId: session.id,
        tokenHash,
        expiresAt: new Date(Date.now() + ALERT_TOKEN_LIFETIME_MS),
        usedAt: null,
      }),
    );

    const appUrl = this.configService.get<string>(
      'APP_URL',
      'http://localhost:3000',
    );
    const reportUrl = new URL(
      `/v1/auth/login-alerts/${rawToken}/report`,
      appUrl,
    ).toString();
    await this.mailService.sendNewLoginAlertEmail(user.email, {
      time: session.createdAt,
      ipAddress: session.ipAddress,
      countryCode: session.countryCode,
      device: session.deviceInfo ?? 'Unknown device',
      userAgent: session.userAgent,
      reportUrl,
    });
    return true;
  }

  async setPreference(
    userId: string,
    enabled: boolean,
  ): Promise<{ enabled: boolean }> {
    const result = await this.userRepository.update(
      { id: userId },
      {
        loginAlertsEnabled: enabled,
      },
    );
    if (!result.affected) throw new NotFoundException('User not found');
    return { enabled };
  }

  async reportNotMe(rawToken: string): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const now = new Date();
    const action = await this.actionTokenRepository.findOne({
      where: {
        tokenHash,
        usedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
    });
    if (!action) {
      throw new UnauthorizedException('Invalid or expired login alert link');
    }

    const claimed = await this.actionTokenRepository
      .createQueryBuilder()
      .update(LoginAlertActionToken)
      .set({ usedAt: now })
      .where('id = :id AND "usedAt" IS NULL AND "expiresAt" > :now', {
        id: action.id,
        now,
      })
      .execute();
    if (!claimed.affected) {
      throw new UnauthorizedException('Login alert link has already been used');
    }

    const user = await this.userRepository.findOneBy({ id: action.userId });
    if (!user) throw new NotFoundException('User not found');

    await this.sessionsService.revokeAllForUser(user.id);
    await this.userRepository.update(
      { id: user.id },
      { passwordResetRequired: true },
    );

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenHash = createHash('sha256')
      .update(resetToken)
      .digest('hex');
    await this.passwordResetTokenRepository.save(
      this.passwordResetTokenRepository.create({
        userId: user.id,
        tokenHash: resetTokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_LIFETIME_MS),
        used: false,
      }),
    );
    await this.mailService.sendPasswordResetEmail(user.email, resetToken);

    return {
      message:
        'All sessions have been revoked. A password reset email has been sent.',
    };
  }

  async pruneExpiredActionTokens(): Promise<void> {
    await this.actionTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
  }
}
